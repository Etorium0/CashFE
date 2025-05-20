import Web3 from 'web3'
import axios from 'axios'
import { graph } from '@/services'
import { download } from '@/store/snark'
import networkConfig from '@/networkConfig'
import InstanceABI from '@/abis/Instance.abi.json'
import { CONTRACT_INSTANCES, eventsType } from '@/constants'
import { sleep, formatEvents, formatEvent, capitalizeFirstLetter } from '@/utils'

class EventService {
  constructor({ netId, amount, currency, factoryMethods }) {
    this.idb = window.$nuxt.$indexedDB(netId)
    this.baseUrl = process.env.URL

    const { nativeCurrency } = networkConfig[`netId${netId}`]

    this.netId = netId
    this.amount = amount
    this.currency = currency

    this.factoryMethods = factoryMethods
    this.contract = this.getContract({ netId, amount, currency })

    this.isNative = nativeCurrency === this.currency
    this.hasCache = this.isNative && (Number(this.netId) === 1 || Number(this.netId) === 56)
  }

  getInstanceName(type) {
    return `${type}s_${this.currency}_${this.amount}`
  }

  async getEvents(type) {
    let cachedEvents = await this.getEventsFromDB(type)

    if (!cachedEvents && this.hasCache) {
      cachedEvents = await this.getEventsFromCache(type)
    }
    return cachedEvents
  }
  async updateEvents(type, cachedEvents) {
    const { deployedBlock } = networkConfig[`netId${this.netId}`]

    const savedEvents = cachedEvents || (await this.getEvents(type))

    let fromBlock = deployedBlock
    if (savedEvents) {
      fromBlock = savedEvents.lastBlock + 1
    }

    const newEvents = await this.getEventsFromBlock({
      type,
      fromBlock,
      graphMethod: `getAll${capitalizeFirstLetter(type)}s`
    })

    const allEvents = [].concat(savedEvents?.events || [], newEvents?.events || []).sort((a, b) => {
      if (a.leafIndex && b.leafIndex) {
        return a.leafIndex - b.leafIndex
      }
      return a.blockNumber - b.blockNumber
    })

    const lastBlock = allEvents[allEvents.length - 1].blockNumber

    this.saveEvents({ events: allEvents, lastBlock, type })

    return {
      events: allEvents,
      lastBlock
    }
  }

  async findEvent({ eventName, eventToFind, type }) {
    const instanceName = this.getInstanceName(type)

    let event = await this.idb.getFromIndex({
      storeName: instanceName,
      indexName: eventName,
      key: eventToFind
    })

    const url = `${this.baseUrl}/event/${type}/${eventToFind}`
    console.log(`Getting ${type} with hex ${eventToFind} from indexer`, url)
    const response = await axios.get(url, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      withCredentials: false // Disable sending credentials
    })
    console.log('find event api response', response.data)
    if (response.data && response.data.event) {
      event = formatEvent(response.data.event, type)
    }

    if (event) {
      return event
    } else {
      console.log('event not found from idb')
    }

    const savedEvents = await this.getEvents(type)
    if (savedEvents) {
      event = savedEvents.events.find((event) => event[eventName] === eventToFind)
      if (event) {
        return event
      }
    }

    const freshEvents = await this.updateEvents(type)
    event = freshEvents && freshEvents?.events.find((event) => event[eventName] === eventToFind)

    return event
  }

  getContract({ netId, amount, currency }) {
    const config = networkConfig[`netId${netId}`]
    const address = config.tokens[currency].instanceAddress[amount]
    return this.factoryMethods.getContract(address)
  }

  async getEventsFromCache(type) {
    try {
      const instanceName = this.getInstanceName(type)
      if (!CONTRACT_INSTANCES.includes(String(this.amount))) {
        console.error(`Amount doesn't includes in contract instances`)
        return
      }

      const module = await download({
        contentType: 'string',
        name: `events/${instanceName}.json.zip`
      })
      if (module) {
        console.log('module', module)
      } else {
        console.log('module not found')
      }

      if (module) {
        const events = JSON.parse(module)

        return {
          events,
          lastBlock: events[events.length - 1].blockNumber
        }
      }

      return {
        events: [],
        lastBlock: ''
      }
    } catch (err) {
      return undefined
    }
  }

  async getEventsFromDB(type) {
    try {
      const instanceName = this.getInstanceName(type)

      const savedEvents = await this.idb.getAll({ storeName: instanceName })

      if (!savedEvents || !savedEvents.length) {
        return undefined
      }

      const event = await this.idb.getFromIndex({
        storeName: 'lastEvents',
        indexName: 'name',
        key: instanceName
      })

      return {
        events: savedEvents,
        lastBlock: event.blockNumber
      }
    } catch (err) {
      return undefined
    }
  }

  async getStatisticsRpc({ eventsCount, type }) {
    const { deployedBlock } = networkConfig[`netId${this.netId}`]

    const indexerEvents = await this.getLatestEventsFromIndexer({
      eventsCount,
      type
    })
    if (indexerEvents.events.length) {
      return indexerEvents.events
    }

    const savedEvents = await this.getEvents(eventsType.DEPOSIT)

    if (savedEvents.events.length) {
      const { events } = await this.updateEvents(eventsType.DEPOSIT, savedEvents)
      return events
    }

    const blockRange = 4950
    const fromBlock = deployedBlock
    const { blockDifference, currentBlockNumber } = await this.getBlocksDiff({ fromBlock })

    let numberParts = blockDifference === 0 ? 1 : Math.ceil(blockDifference / blockRange)
    const part = Math.ceil(blockDifference / numberParts)

    let events = []
    let toBlock = currentBlockNumber

    if (fromBlock < currentBlockNumber) {
      for (let i = 0; i < numberParts; i++) {
        try {
          await sleep(200)
          const partOfEvents = await this.getEventsPartFromRpc({
            fromBlock: toBlock - part,
            toBlock,
            type: eventsType.DEPOSIT
          })

          if (partOfEvents) {
            events = events.concat(partOfEvents.events)
            if (eventsCount <= events.length) {
              break
            }
          }
          toBlock -= part
        } catch {
          numberParts = numberParts + 1
        }
      }
      if (eventsCount !== events.length) {
        const savedEvents = await this.getEvents(eventsType.DEPOSIT)
        events = events.concat(savedEvents?.events || [])
      }
    }

    return events
  }

  async getEventsFromGraph({ fromBlock, methodName }) {
    try {
      const { events, lastSyncBlock } = await graph[methodName]({
        fromBlock,
        netId: this.netId,
        amount: this.amount,
        currency: this.currency
      })
      return {
        events,
        lastBlock: lastSyncBlock
      }
    } catch (err) {
      return undefined
    }
  }

  async getBlocksDiff({ fromBlock }) {
    const currentBlockNumber = await this.factoryMethods.getBlockNumber()

    return {
      currentBlockNumber,
      blockDifference: Math.ceil(currentBlockNumber - fromBlock)
    }
  }

  async getEventsPartFromRpc({ fromBlock, toBlock, type }) {
    console.log('getting events part from rpc')
    try {
      const { currentBlockNumber } = await this.getBlocksDiff({ fromBlock })
      if (fromBlock > currentBlockNumber) {
        return {
          events: [],
          lastBlock: fromBlock
        }
      }
      let events
      console.log('this.netId', this.netId)
      if (this.netId !== 0) {
        events = await this.contract.getPastEvents(capitalizeFirstLetter(type), {
          fromBlock,
          toBlock
        })
      } else {
        const blockRange = 450
        let from = 37783281
        const to = from + 499
        let allEvents = []
        while (from <= to) {
          const minTo = Math.min(from, to)
          console.log('from', from)
          console.log('to', minTo)
          const partEvents = await this.contract.getPastEvents(capitalizeFirstLetter(type), {
            fromBlock: from,
            toBlock: minTo
          })
          if (partEvents && partEvents.length > 0) {
            allEvents = allEvents.concat(partEvents)
          }
          from = from + blockRange
        }
        events = allEvents
      }

      console.log('events get from rpc', JSON.stringify(formatEvents(events, type)))

      if (!events?.length) {
        return {
          events: [],
          lastBlock: fromBlock
        }
      }
      return {
        events: formatEvents(events, type),
        lastBlock: events[events.length - 1].blockNumber
      }
    } catch (err) {
      return undefined
    }
  }

  async getBatchEventsFromRpc({ fromBlock, type }) {
    try {
      const blockRange = 4950
      const { blockDifference, currentBlockNumber } = await this.getBlocksDiff({ fromBlock })

      let numberParts = blockDifference === 0 ? 1 : Math.ceil(blockDifference / blockRange)
      const part = Math.ceil(blockDifference / numberParts)

      let events = []
      let toBlock = fromBlock + part

      if (fromBlock < currentBlockNumber) {
        if (toBlock >= currentBlockNumber) {
          toBlock = 'latest'
          numberParts = 1
        }

        for (let i = 0; i < numberParts; i++) {
          try {
            await sleep(200)
            const partOfEvents = await this.getEventsPartFromRpc({ fromBlock, toBlock, type })
            if (partOfEvents) {
              events = events.concat(partOfEvents.events)
            }
            fromBlock = toBlock
            toBlock += part
          } catch {
            numberParts = numberParts + 1
          }
        }
        if (events.length) {
          return {
            events,
            lastBlock: toBlock === 'latest' ? currentBlockNumber : toBlock
          }
        }
      }
      return undefined
    } catch (err) {
      return undefined
    }
  }

  async getEventsFromRpc({ fromBlock, type }) {
    try {
      let events

      if (Number(this.netId) === 56) {
        const rpcEvents = await this.getBatchEventsFromRpc({ fromBlock, type })
        events = rpcEvents?.events || []
      } else {
        const rpcEvents = await this.getEventsPartFromRpc({ fromBlock, toBlock: 'latest', type })
        events = rpcEvents?.events || []
      }
      return events
    } catch (err) {
      return []
    }
  }

  async getEventsFromBlock({ fromBlock, graphMethod, type }) {
    try {
      // ToDo think about undefined
      const indexerEvents = await this.getEventsFromEventIndexer({ fromBlock, type })
      if (indexerEvents) {
        return {
          events: indexerEvents.events,
          lastBlock: indexerEvents.lastBlock
        }
      }

      const graphEvents = await this.getEventsFromGraph({ fromBlock, methodName: graphMethod })
      const lastSyncBlock = fromBlock > graphEvents?.lastBlock ? fromBlock : graphEvents?.lastBlock
      const rpcEvents = await this.getEventsFromRpc({ fromBlock: lastSyncBlock, type })

      const allEvents = [].concat(graphEvents?.events || [], rpcEvents || [])
      if (allEvents.length) {
        return {
          events: allEvents,
          lastBlock: allEvents[allEvents.length - 1].blockNumber
        }
      }
      return undefined
    } catch (err) {
      return undefined
    }
  }

  // TODO: find event from indexer
  async findEventFromIndexer({ eventName, eventToFind, type }) {}

  async getLatestEventsFromIndexer({ eventsCount, type }) {
    const url = `${this.baseUrl}/events/${this.netId}/${this.contract._address}/${type}?limit=${eventsCount}&fromBlock=0&toBlock=0`
    console.log(`Getting ${eventsCount} events from indexer`, url)
    let response
    try {
      response = await axios.get(url, {
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        withCredentials: false // Disable sending credentials
      })
      console.log('response.data', response.data)
      if (response.data && response.data.events) {
        console.log('formattedEvents', formatEvents(response.data.events, type))
        const formattedEvents = formatEvents(response.data.events, type)
        return {
          events: formattedEvents,
          lastBlock: response.data.events[response.data.events.length - 1].blockNumber
        }
      }
      return undefined
    } catch (err) {
      console.log('Full error:', err)
      console.log(`Error fetching events from indexer: ${err.message}`)
      if (err.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        console.error('Error response data:', err.response.data)
        console.error('Error response status:', err.response.status)
        console.error('Error response headers:', err.response.headers)
      }
    }
    return undefined
  }

  async getEventsFromBlockEventIndexer({ fromBlock, type }) {
    try {
      console.log('Getting events from block event indexer from block', fromBlock, 'type', type)
      const url = `${this.baseUrl}/events/${this.netId}/${this.contract._address}/${type}?fromBlock=${fromBlock}`
      const response = await axios.get(url)

      if (response.data && response.data.events) {
        const formattedEvents = formatEvents(response.data.events)
        const lastBlock = response.data.lastBlock || formattedEvents[formattedEvents.length - 1].blockNumber

        console.log('formattedEvents', formattedEvents)
        console.log('lastBlock', lastBlock)

        return {
          events: formattedEvents,
          lastBlock
        }
      }
      return undefined
    } catch (err) {
      console.error(`Error fetching events from event indexer: ${err.message}`)
      return undefined
    }
  }

  async saveEvents({ events, lastBlock, type }) {
    try {
      if (!events || !events.length || this.idb.isBlocked) {
        return
      }

      const instanceName = this.getInstanceName(type)

      await this.idb.createMultipleTransactions({
        data: events,
        storeName: instanceName
      })

      await this.idb.putItem({
        data: {
          blockNumber: lastBlock,
          name: instanceName
        },
        storeName: 'lastEvents'
      })
    } catch (err) {
      console.error('saveEvents has error:', err.message)
    }
  }
}

class EventsFactory {
  instances = new Map()

  constructor(rpcUrl) {
    this.provider = new Web3(rpcUrl).eth
  }

  getBlockNumber = () => {
    return this.provider.getBlockNumber()
  }

  getContract = (address) => {
    return new this.provider.Contract(InstanceABI, address)
  }

  getService = (payload) => {
    const instanceName = `${payload.currency}_${payload.amount}`
    if (this.instances.has(instanceName)) {
      return this.instances.get(instanceName)
    }

    const instance = new EventService({
      ...payload,
      factoryMethods: {
        getContract: this.getContract,
        getBlockNumber: this.getBlockNumber
      }
    })
    this.instances.set(instanceName, instance)
    return instance
  }
}

export { EventsFactory }
