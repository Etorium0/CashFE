/* eslint-disable camelcase */
/* eslint-disable no-console, import/order */
import Web3 from 'web3'

import networkConfig from '@/networkConfig'
import { cachedEventsLength, eventsType } from '@/constants'

import MulticallABI from '@/abis/Multicall.json'
import InstanceABI from '@/abis/Instance.abi.json'
import TornadoProxyABI from '@/abis/TornadoProxy.abi.json'

import { ACTION, ACTION_GAS } from '@/constants/variables'
import { graph, EventsFactory } from '@/services'
import axios from 'axios'
import {
  randomBN,
  parseNote,
  toFixedHex,
  saveAsFile,
  isEmptyArray,
  decimalPlaces,
  parseHexNote,
  buffPedersenHash
} from '@/utils'
import { generateWitness } from './generateWitness'
import { download } from './snark'

const { toWei, numberToHex, toBN, isAddress } = require('web3-utils')

const getStatisticStore = (acc, { tokens }) => {
  Object.entries(tokens).forEach(([currency, { instanceAddress }]) => {
    acc[currency] = Object.assign({}, acc[currency])

    Object.keys(instanceAddress).forEach((amount) => {
      if (!acc[currency][amount]) {
        acc[currency][amount] = {
          latestDeposits: [],
          nextDepositIndex: null,
          anonymitySet: null
        }
      }
    })
  })
  return acc
}

const defaultStatistics = Object.values(networkConfig).reduce(getStatisticStore, {})

const state = () => {
  return {
    note: null,
    commitment: null,
    prefix: null,
    notes: {},
    statistic: defaultStatistics,
    ip: {},
    selectedInstance: { currency: 'eth', amount: 0.1 },
    selectedStatistic: { currency: 'eth', amount: 0.1 },
    withdrawType: 'relayer',
    ethToReceive: '20000000000000000',
    defaultEthToReceive: '20000000000000000',
    withdrawNote: '',
    isKYC: false
  }
}

const mutations = {
  SAVE_DEPOSIT(state, { note, commitment, prefix }) {
    state.note = note
    state.commitment = commitment
    state.prefix = prefix
  },
  SAVE_PROOF(state, { proof, args, note }) {
    this._vm.$set(state.notes, note, { proof, args })
  },
  REMOVE_PROOF(state, { note }) {
    this._vm.$delete(state.notes, note)
  },
  SAVE_LAST_INDEX(state, { nextDepositIndex, anonymitySet, currency, amount }) {
    const currentState = state.statistic[currency][amount]
    this._vm.$set(state.statistic[currency], `${amount}`, { ...currentState, nextDepositIndex, anonymitySet })
  },
  SAVE_LAST_EVENTS(state, { latestDeposits, currency, amount }) {
    const currentState = state.statistic[currency][amount]
    this._vm.$set(state.statistic[currency], `${amount}`, { ...currentState, latestDeposits })
  },
  SET_SELECTED_INSTANCE(state, selectedInstance) {
    state.selectedInstance = selectedInstance
  },
  SET_SELECTED_STATISTIC(state, selectedStatistic) {
    state.selectedStatistic = selectedStatistic
  },
  SET_WITHDRAW_TYPE(state, { withdrawType }) {
    this._vm.$set(state, 'withdrawType', withdrawType)
  },
  SAVE_ETH_TO_RECEIVE(state, { ethToReceive }) {
    this._vm.$set(state, 'ethToReceive', ethToReceive)
  },
  SAVE_DEFAULT_ETH_TO_RECEIVE(state, { ethToReceive }) {
    this._vm.$set(state, 'defaultEthToReceive', ethToReceive)
  },
  SET_WITHDRAW_NOTE(state, withdrawNote) {
    state.withdrawNote = withdrawNote
  },
  SET_KYC(state, value) {
    state.isKYC = value
  }
}

const getters = {
  eventsInterface: (state, getters, rootState, rootGetters) => {
    const netId = rootGetters['metamask/netId']
    const { url } = rootState.settings[`netId${netId}`].rpc
    return new EventsFactory(url)
  },
  instanceContract: (state, getters, rootState) => ({ currency, amount, netId }) => {
    const config = networkConfig[`netId${netId}`]
    const { url } = rootState.settings[`netId${netId}`].rpc
    const address = config.tokens[currency].instanceAddress[amount]
    const web3 = new Web3(url)
    return new web3.eth.Contract(InstanceABI, address)
  },
  multicallContract: (state, getters, rootState) => ({ netId }) => {
    const config = networkConfig[`netId${netId}`]
    const { url } = rootState.settings[`netId${netId}`].rpc
    const web3 = new Web3(url)
    return new web3.eth.Contract(MulticallABI, config.multicall)
  },
  tornadoProxyContract: (state, getters, rootState) => ({ netId }) => {
    const {
      'tornado-proxy.contract.tornadocash.eth': tornadoProxy,
      'tornado-router.contract.tornadocash.eth': tornadoRouter,
      'tornado-proxy-light.contract.tornadocash.eth': tornadoProxyLight
    } = networkConfig[`netId${netId}`]
    console.log('tornadoProxyContract', {
      tornadoRouter,
      tornadoProxy,
      tornadoProxyLight
    })
    const proxyContract = tornadoRouter || tornadoProxy || tornadoProxyLight
    const { url } = rootState.settings[`netId${netId}`].rpc
    const web3 = new Web3(url)
    return new web3.eth.Contract(TornadoProxyABI, proxyContract)
  },
  currentContract: (state, getters) => (params) => {
    return getters.tornadoProxyContract(params)
  },
  withdrawGas: (state, getters) => {
    let action = ACTION.WITHDRAW_WITH_EXTRA

    if (getters.hasEnabledLightProxy) {
      action = ACTION.WITHDRAW
    }

    if (getters.isOptimismConnected) {
      action = ACTION.OP_WITHDRAW
    }

    if (getters.isArbitrumConnected) {
      action = ACTION.ARB_WITHDRAW
    }

    return ACTION_GAS[action]
  },
  networkFee: (state, getters, rootState, rootGetters) => {
    const gasPrice = rootGetters['gasPrices/gasPrice']

    const networkFee = toBN(gasPrice).mul(toBN(getters.withdrawGas))

    if (getters.isOptimismConnected) {
      const l1Fee = rootGetters['gasPrices/l1Fee']
      return networkFee.add(toBN(l1Fee))
    }

    return networkFee
  },
  relayerFee: (state, getters, rootState, rootGetters) => {
    const { currency, amount } = rootState.application.selectedStatistic
    const { decimals } = rootGetters['metamask/networkConfig'].tokens[currency]
    const nativeCurrency = rootGetters['metamask/nativeCurrency']
    const total = toBN(rootGetters['token/fromDecimals'](amount.toString()))
    const fee = rootState.relayer.selectedRelayer.tornadoServiceFee
    const decimalsPoint = decimalPlaces(fee)
    const roundDecimal = 10 ** decimalsPoint
    const aroundFee = toBN(parseInt(fee * roundDecimal, 10))
    const tornadoServiceFee = total.mul(aroundFee).div(toBN(roundDecimal * 100))
    const ethFee = getters.networkFee
    switch (currency) {
      case nativeCurrency: {
        return ethFee.add(tornadoServiceFee)
      }
      default: {
        const tokenFee = ethFee.mul(toBN(10 ** decimals)).div(toBN(rootState.price.prices[currency]))
        return tokenFee.add(tornadoServiceFee)
      }
    }
  },
  ethToReceiveInToken: (state, getters, rootState, rootGetters) => {
    const { currency } = rootState.application.selectedStatistic
    const { decimals } = rootGetters['metamask/networkConfig'].tokens[currency]
    const price = rootState.price.prices[currency]
    const ethToReceive = toBN(state.ethToReceive)
    return ethToReceive.mul(toBN(10 ** decimals)).div(toBN(price))
  },
  isNotEnoughTokens: (state, getters, rootState, rootGetters) => {
    const { amount, currency } = rootState.application.selectedStatistic
    let total = toBN(rootGetters['token/fromDecimals'](amount.toString()))

    if (state.withdrawType === 'relayer') {
      const relayerFee = getters.relayerFee
      const nativeCurrency = rootGetters['metamask/nativeCurrency']

      if (currency === nativeCurrency) {
        total = total.sub(relayerFee)
      } else {
        const ethToReceiveInToken = getters.ethToReceiveInToken
        total = total.sub(relayerFee).sub(ethToReceiveInToken)
      }
    }

    return total.isNeg()
  },
  maxEthToReceive: (state, getters, rootState, rootGetters) => {
    const { currency, amount } = rootState.application.selectedStatistic
    const { decimals } = rootGetters['metamask/networkConfig'].tokens[currency]
    const total = toBN(rootGetters['token/fromDecimals'](amount.toString()))
    const price = rootState.price.prices[currency]
    const relayerFee = getters.relayerFee
    return total
      .sub(relayerFee)
      .mul(toBN(price))
      .div(toBN(10 ** decimals))
  },
  selectedCurrency: (state, getters, rootState, rootGetters) => {
    const tokens = rootGetters['metamask/networkConfig'].tokens
    return tokens[state.selectedInstance.currency].symbol
  },
  selectedStatisticCurrency: (state, getters, rootState, rootGetters) => {
    const tokens = rootGetters['metamask/networkConfig'].tokens
    return tokens[state.selectedStatistic.currency].symbol
  },
  lastEventIndex: (state) => ({ currency, amount }) => {
    return state.statistic[currency][amount].anonymitySet
  },
  latestDeposits: (state) => {
    const { currency, amount } = state.selectedStatistic
    return state.statistic[currency][amount].latestDeposits
  },
  hasEnabledLightProxy: (state, getters, rootState, rootGetters) => {
    return Boolean(rootGetters['metamask/networkConfig']['tornado-proxy-light.contract.tornadocash.eth'])
  },
  isOptimismConnected: (state, getters, rootState, rootGetters) => {
    const netId = rootGetters['metamask/netId']
    return Number(netId) === 10
  },
  isArbitrumConnected: (state, getters, rootState, rootGetters) => {
    const netId = rootGetters['metamask/netId']
    return Number(netId) === 42161
  },
  isKYC: (state) => state.isKYC
}

const actions = {
  setAndUpdateStatistic({ dispatch, commit }, { currency, amount }) {
    commit('SET_SELECTED_STATISTIC', { currency, amount })
    dispatch('updateSelectEvents')
  },
  async updateSelectEvents({ dispatch, commit, state, rootGetters, getters }) {
    console.log('updateSelectEvents')
    const netId = rootGetters['metamask/netId']
    const { currency, amount } = state.selectedStatistic

    const eventService = getters.eventsInterface.getService({ netId, amount, currency })

    // TODO: get events from indexer
    const graphEvents = await eventService.getEventsFromGraph({ methodName: 'getStatistic' })
    let statistic = graphEvents?.events

    if (!statistic || !statistic.length) {
      const fresh = await eventService.getStatisticsRpc({ eventsCount: 10, type: eventsType.DEPOSIT })
      console.log('fresh events', fresh)

      statistic = fresh || []
    }

    const { nextDepositIndex, anonymitySet } = await dispatch('getLastDepositIndex', {
      currency,
      amount,
      netId
    })

    statistic = statistic.sort((a, b) => a.leafIndex - b.leafIndex)

    const latestDeposits = []

    for (const event of statistic.slice(-10)) {
      latestDeposits.unshift({
        index: event.leafIndex,
        depositTime: this.$moment.unix(event.timestamp).fromNow()
      })
    }

    commit('SAVE_LAST_EVENTS', {
      amount,
      currency,
      latestDeposits
    })
    commit('SAVE_LAST_INDEX', {
      amount,
      currency,
      anonymitySet,
      nextDepositIndex
    })
  },
  async updateEvents({ getters, rootGetters }, payload) {
    try {
      const eventService = getters.eventsInterface.getService(payload)

      const freshEvents = await eventService.updateEvents(payload.type)

      return freshEvents
    } catch (err) {
      throw new Error(`Method updateEvents has error: ${err.message}`)
    }
  },
  async updateCurrentEvents({ dispatch, rootGetters }, { amount, currency, lastEvent, type, netId }) {
    let lastBlock = lastEvent
    const nativeCurrency = rootGetters['metamask/nativeCurrency']
    const { deployedBlock } = networkConfig[`netId${netId}`]

    if (currency === nativeCurrency && !lastEvent) {
      lastBlock = await this.$indexedDB(netId).getFromIndex({
        indexName: 'name',
        storeName: 'lastEvents',
        key: `${type}s_${currency}_${amount}`
      })
    }

    const params = {
      type,
      netId,
      amount,
      currency,
      fromBlock: lastBlock ? lastBlock.blockNumber + 1 : deployedBlock
    }

    const events = await dispatch('updateEvents', params)

    return events
  },
  async getLastDepositIndex({ getters }, params) {
    try {
      const contractInstance = getters.instanceContract(params)
      const nextDepositIndex = await contractInstance.methods.nextIndex().call()

      return {
        nextDepositIndex,
        anonymitySet: toBN(nextDepositIndex)
      }
    } catch (err) {
      throw new Error(`Method getLastDepositIndex has error: ${err.message}`)
    }
  },
  async loadEncryptedEvents(_, { netId }) {
    try {
      const module = await download({
        contentType: 'string',
        name: `events/encrypted_notes_${netId}.json.zip`
      })

      if (module) {
        const events = JSON.parse(module)

        return {
          events,
          lastBlock: events[events.length - 1].blockNumber
        }
      }
    } catch (err) {
      throw new Error(`Method loadCachedEvents has error: ${err.message}`)
    }
  },
  prepareDeposit({ getters, dispatch, commit, rootGetters }, { prefix }) {
    try {
      const [, currency, amount, netId] = prefix.split('-')
      const contractInstance = getters.instanceContract({ currency, amount, netId })

      const secret = randomBN(31)
      const nullifier = randomBN(31)

      const preimage = Buffer.concat([nullifier.toBuffer('le', 31), secret.toBuffer('le', 31)])

      const commitment = buffPedersenHash(preimage)
      const commitmentHex = toFixedHex(commitment)

      const note = `0x${preimage.toString('hex')}`

      const isEnabled = rootGetters['encryptedNote/isEnabledSaveFile']

      if (isEnabled) {
        setTimeout(() => {
          try {
            dispatch('saveFile', { prefix, note })
          } catch (err) {
            console.warn('NoteAccount backup as a file is not supported on this device', err)
          }
        }, 1000)
      }

      commit('SAVE_DEPOSIT', { note, commitment: commitmentHex, prefix })
      if (!contractInstance._address) {
        throw new Error(this.app.i18n.t('networkIsNotSupported'))
      }
    } catch (e) {
      console.error('prepareDeposit', e)
    }
  },
  saveFile(_, { prefix, note }) {
    try {
      const data = new Blob([`${prefix}-${note}`], { type: 'text/plain;charset=utf-8' })

      saveAsFile(data, `backup-${prefix}-${note.slice(0, 10)}.txt`)
    } catch (err) {
      console.error('saveFile', err.message)
    }
  },
  async getEncryptedEventsFromDb(_, { netId }) {
    try {
      const idb = this.$indexedDB(netId)

      if (idb.isBlocked) {
        return []
      }

      const cachedEvents = await idb.getAll({ storeName: 'encrypted_events' })

      return cachedEvents
    } catch (err) {
      console.warn(`Method getEventsFromDb has error: ${err.message}`)
    }
  },
  async getEncryptedNotes({ rootState, rootGetters, dispatch, getters }) {
    try {
      const { netId } = rootState.metamask
      const rpc = rootGetters['settings/currentRpc']
      let { ENCRYPTED_NOTES_BLOCK: deployedBlock } = networkConfig[`netId${netId}`].constants

      const contractInstance = getters.tornadoProxyContract({ netId })

      let cachedEvents = await dispatch('getEncryptedEventsFromDb', { netId })

      const networksWithCache = {
        1: cachedEventsLength.mainnet.ENCRYPTED_NOTES,
        5: cachedEventsLength.goerli.ENCRYPTED_NOTES,
        56: cachedEventsLength.bsc.ENCRYPTED_NOTES
      }

      const LENGTH_CACHE = networksWithCache[Number(netId)]

      if (
        ((isEmptyArray(cachedEvents) || !cachedEvents) && networksWithCache[Number(netId)]) ||
        cachedEvents.length < LENGTH_CACHE
      ) {
        ;({ events: cachedEvents } = await dispatch('loadEncryptedEvents', { netId }))
      }

      const hasCache = Boolean(cachedEvents && cachedEvents.length)

      if (hasCache) {
        const [lastEvent] = cachedEvents.sort((a, b) => a.blockNumber - b.blockNumber).slice(-1)

        deployedBlock = lastEvent.blockNumber + 1
      }

      const web3 = this.$provider.getWeb3(rpc.url)
      const currentBlockNumber = await web3.eth.getBlockNumber()

      let events = []

      const { events: graphEvents, lastSyncBlock } = await graph.getAllEncryptedNotes({
        netId,
        fromBlock: deployedBlock
      })

      if (lastSyncBlock) {
        deployedBlock = lastSyncBlock
      }

      const blockDifference = Math.ceil(currentBlockNumber - deployedBlock)
      const divisor = hasCache ? 2 : 10

      let blockRange = blockDifference > divisor ? blockDifference / divisor : blockDifference

      if (Number(netId) === 56) {
        blockRange = 4950
      }

      let numberParts = blockDifference === 0 ? 1 : Math.ceil(blockDifference / blockRange)
      const part = Math.ceil(blockDifference / numberParts)

      let fromBlock = deployedBlock
      let toBlock = deployedBlock + part

      if (toBlock >= currentBlockNumber || toBlock === deployedBlock) {
        toBlock = 'latest'
        numberParts = 1
      }

      for (let i = 0; i < numberParts; i++) {
        const partOfEvents = await contractInstance.getPastEvents('EncryptedNote', {
          toBlock,
          fromBlock
        })
        if (partOfEvents) {
          events = events.concat(partOfEvents)
        }
        fromBlock = toBlock
        toBlock += part
      }

      if (events && events.length) {
        events = events
          .filter((i) => i.returnValues.encryptedNote)
          .map((e) => ({
            txHash: e.transactionHash,
            transactionHash: e.transactionHash,
            blockNumber: Number(e.blockNumber),
            encryptedNote: e.returnValues.encryptedNote
          }))
      }

      const allEvents = [].concat(cachedEvents, graphEvents, events)

      await dispatch('saveEncryptedEventsToDB', { events: allEvents, netId })

      return allEvents
    } catch (err) {
      console.log('getEncryptedNotes', err)
    }
  },
  async saveEncryptedEventsToDB(_, { events, netId }) {
    const idb = this.$indexedDB(netId)

    if (!events || !events.length || idb.isBlocked) {
      return
    }

    await idb.createMultipleTransactions({
      data: events,
      storeName: `encrypted_events`
    })
  },
  async sendDeposit({ state, rootState, getters, rootGetters, dispatch, commit }, { isEncrypted }) {
    try {
      console.log('Starting deposit process...', { isEncrypted })
      const { commitment, note, prefix } = state
      console.log('Deposit data:', { commitment, note: note.substring(0, 10) + '...', prefix })

      // eslint-disable-next-line prefer-const
      let [, currency, amount, netId] = prefix.split('-')
      console.log('Parsed prefix:', { currency, amount, netId })

      const config = networkConfig[`netId${netId}`]
      const contractInstance = getters.tornadoProxyContract({ netId })
      console.log('Contract address:', contractInstance._address)
      console.log('Contract instance:', contractInstance)

      if (!state.commitment) {
        throw new Error(this.app.i18n.t('failToGenerateNote'))
      }

      const { nextDepositIndex: index } = await dispatch('getLastDepositIndex', { netId, currency, amount })
      console.log('Current deposit index:', index)

      const { ethAccount } = rootState.metamask
      const nativeCurrency = rootGetters['metamask/nativeCurrency']
      const isNative = currency === nativeCurrency
      console.log('Transaction details:', {
        from: ethAccount,
        isNativeCurrency: isNative,
        nativeCurrency
      })

      const value = isNative ? toWei(amount, 'ether') : '0'
      const instance = config.tokens[currency].instanceAddress[amount]
      console.log('Instance details:', { instance, value })

      let params = [instance, commitment, []]
      console.log('Initial deposit params:', params)

      if (isEncrypted) {
        console.log('Preparing encrypted note...')
        const encryptedNote = await dispatch(
          'encryptedNote/getEncryptedNote',
          { data: `${instance}-${note}` },
          { root: true }
        )
        console.log('Encrypted note received, length:', encryptedNote.length)
        params = [instance, commitment, encryptedNote]
      }
      console.log('isEncrypted', isEncrypted)
      // console.log('Final deposit params:', [
      //   params[0],
      //   params[1],
      //   params[2] ? `${params[2].substring(0, 10)}...` : []
      // ])
      console.log('params', params)

      const data = contractInstance.methods.deposit(...params).encodeABI()
      console.log('Encoded transaction data (first 20 chars):', data.substring(0, 20) + '...')

      // Simplify gas estimation with better error handling
      console.log('Starting gas estimation...')
      let gas
      try {
        // Wrap in Promise.resolve to ensure we can catch any synchronous errors too
        gas = await Promise.resolve().then(() => {
          return contractInstance.methods.deposit(...params).estimateGas({ from: ethAccount, value })
        })
        console.log('Gas estimation successful:', gas)
      } catch (err) {
        console.error('Gas estimation failed with error:', err)
        console.error('Error details:', {
          message: err.message,
          code: err.code,
          reason: err.reason,
          stack: err.stack
        })

        // Try with higher gas limit as fallback
        console.log('Attempting fallback with fixed gas limit...')
        gas = 300000
        console.log('Using fallback gas value:', gas)
      }

      const callParams = {
        method: 'eth_sendTransaction',
        params: {
          to: contractInstance._address,
          gas: numberToHex(gas + 50000),
          value: numberToHex(value),
          data
        },
        watcherParams: {
          title: { path: 'depositing', amount, currency },
          successTitle: {
            path: 'depositedValue',
            amount,
            currency
          },
          storeType: isEncrypted ? 'encryptedTxs' : 'txs'
        },
        isAwait: false
      }

      console.log('Sending transaction with params:', {
        to: contractInstance._address,
        gas: gas + 50000,
        value: isNative ? `${amount} ${currency}` : '0',
        dataSize: data.length
      })

      const txHash = await dispatch('metamask/sendTransaction', callParams, { root: true })
      console.log('Transaction sent! Hash:', txHash)

      // there may be a race condition, you need to request an index and a timestamp of the deposit after tx is mined
      const timestamp = Math.round(new Date().getTime() / 1000)
      console.log('Recording timestamp:', timestamp)

      const { nullifierHex, commitmentHex } = parseHexNote(state.note)
      console.log('Parsed note:', {
        nullifierHex: nullifierHex.substring(0, 10) + '...',
        commitmentHex: commitmentHex.substring(0, 10) + '...'
      })

      const storeType = isEncrypted ? 'encryptedTxs' : 'txs'

      const accounts = rootGetters['encryptedNote/accounts']

      const tx = {
        txHash,
        type: 'Deposit',
        note,
        amount,
        storeType,
        prefix,
        netId,
        timestamp,
        index,
        nullifierHex,
        commitmentHex,
        currency
      }
      console.log('Saving transaction to store:', { ...tx, note: tx.note.substring(0, 10) + '...' })

      if (isEncrypted) {
        tx.note = params[2]
        tx.owner = isAddress(accounts.encrypt) ? accounts.encrypt : ''
        tx.backupAccount = isAddress(accounts.backup) ? accounts.backup : ''
        console.log('Added encryption details:', {
          owner: tx.owner ? tx.owner.substring(0, 10) + '...' : 'none',
          backupAccount: tx.backupAccount ? tx.backupAccount.substring(0, 10) + '...' : 'none'
        })
      }

      commit('txHashKeeper/SAVE_TX_HASH', tx, { root: true })
      console.log('Deposit transaction completed successfully!')
    } catch (e) {
      console.error('sendDeposit error:', e)
      return false
    }
  },
  async checkSpentEventFromNullifier({ getters, dispatch }, parsedNote) {
    try {
      const isSpent = await dispatch('loadEvent', {
        note: parsedNote,
        eventName: 'nullifierHash',
        type: eventsType.WITHDRAWAL,
        methodName: 'getAllWithdrawals',
        eventToFind: parsedNote.nullifierHex
      })

      return Boolean(isSpent)
    } catch (err) {
      console.error(`Method checkSpentEventFromNullifier has error: ${err.message}`)
    }
  },
  async checkRoot({ getters }, { root, parsedNote }) {
    const contractInstance = getters.instanceContract(parsedNote)

    const isKnownRoot = await contractInstance.methods.isKnownRoot(root).call()

    if (!isKnownRoot) {
      throw new Error(this.app.i18n.t('invalidRoot'))
    }
  },
  async createSnarkProof({ rootGetters, rootState, state, getters }, { note, recipient, leaves }) {
    const nativeCurrency = rootGetters['metamask/nativeCurrency']
    const withdrawType = state.withdrawType

    let relayer = BigInt(recipient)
    let fee = BigInt(0)
    let refund = BigInt(0)

    if (withdrawType === 'relayer') {
      let totalRelayerFee = getters.relayerFee
      relayer = BigInt(rootState.relayer.selectedRelayer.address)

      if (note.currency !== nativeCurrency) {
        refund = BigInt(state.ethToReceive.toString())
        totalRelayerFee = totalRelayerFee.add(getters.ethToReceiveInToken)
      }

      fee = BigInt(totalRelayerFee.toString())
    }

    const input = {
      // public
      fee,
      refund,
      relayer,
      recipient: BigInt(recipient),
      nullifierHash: note.nullifierHash,
      secret: note.secret,
      nullifier: note.nullifier,
      leaves
    }

    console.log('Start generating SNARK proof', input)
    console.time('SNARK proof time')
    let proof
    try {
      console.log('generating witness')
      console.log('nullifier', input.nullifier)
      console.log('secret', input.secret)
      console.log('recipient', input.recipient)
      console.log('relayer', input.relayer)
      console.log('fee', input.fee)
      console.log('refund', input.refund)
      proof = await generateWitness(
        input.nullifier,
        input.secret,
        input.recipient,
        input.relayer,
        input.leaves,
        input.fee,
        input.refund
      )
    } catch (err) {
      console.error('Error generating witness:', err)
      throw new Error(`Failed to generate witness: ${err.message}`)
    }

    const args = [
      proof.root,
      proof.nullifierHash,
      toFixedHex(input.recipient, 20),
      toFixedHex(input.relayer, 20),
      toFixedHex(input.fee),
      toFixedHex(input.refund)
    ]

    return { args, proof }
  },
  async prepareWithdraw({ dispatch, getters, commit }, { note, recipient }) {
    console.log('preparing withdraw')
    commit('REMOVE_PROOF', { note })
    try {
      const parsedNote = parseNote(note)

      const isSpent = await dispatch('checkSpentEventFromNullifier', parsedNote)

      if (isSpent) {
        throw new Error(this.app.i18n.t('noteHasBeenSpent'))
      }

      const [, currency, amount, netId] = note.split('-')
      const config = networkConfig[`netId${netId}`]
      const instance = config.tokens[currency].instanceAddress[amount]

      // TODO: add leaves
      let leaves = []
      const url = `${process.env.URL}/leaves/${netId}/${instance}`
      console.log(`Getting leaves with hex ${parsedNote.nullifierHex} from indexer`, url)
      const response = await axios.get(url, {
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        withCredentials: false // Disable sending credentials
      })
      console.log('find leaves api response', response.data)
      if (response.data && response.data.leaves) {
        leaves = response.data.leaves
      }
      console.log('leaves', leaves)

      const { proof, args } = await dispatch('createSnarkProof', {
        recipient,
        note: parsedNote,
        leaves
      })
      console.timeEnd('SNARK proof time')
      commit('SAVE_PROOF', { proof, args, note })
    } catch (e) {
      console.error('prepareWithdraw', e)
      throw new Error(e.message)
    }
  },
  async withdraw({ state, rootState, dispatch, getters }, { note }) {
    try {
      const [, currency, amount, netId] = note.split('-')
      const config = networkConfig[`netId${netId}`]
      const { proof, args } = state.notes[note]
      const { ethAccount } = rootState.metamask

      const contractInstance = getters.tornadoProxyContract({ netId })

      const instance = config.tokens[currency].instanceAddress[amount]
      const params = [instance, proof.pA, proof.pB, proof.pC, ...args]
      console.log('params', params)

      // Log the individual parameters
      console.log('Debug withdraw parameters:')
      console.log('_cyclone (instance):', instance)
      console.log('_pA:', proof.pA)
      console.log('_pB:', proof.pB)
      console.log('_pC:', proof.pC)
      console.log('_root:', proof.root)
      console.log('_nullifierHash:', proof.nullifierHash)
      console.log('remaining args:', args)
      console.log('args[5]', args[5])
      // Try logging the encoded data
      const data = contractInstance.methods.withdraw(...params).encodeABI()

      // Simplify gas estimation with better error handling
      console.log('Starting gas estimation...')
      let gas
      try {
        // Wrap in Promise.resolve to ensure we can catch any synchronous errors too
        gas = await Promise.resolve().then(() => {
          return contractInstance.methods
            .withdraw(...params)
            .estimateGas({ from: ethAccount, value: args[5] })
        })
        console.log('Gas estimation successful:', gas)
      } catch (err) {
        console.error('Gas estimation failed with error:', err)
        console.error('Error details:', {
          message: err.message,
          code: err.code,
          reason: err.reason,
          stack: err.stack
        })

        // Try with higher gas limit as fallback
        console.log('Attempting fallback with fixed gas limit...')
        gas = 500000
        console.log('Using fallback gas value:', gas)
      }

      const callParams = {
        method: 'eth_sendTransaction',
        params: {
          data,
          value: args[5],
          to: contractInstance._address,
          gas: numberToHex(gas + 200000)
        },
        watcherParams: {
          title: { path: 'withdrawing', amount, currency },
          successTitle: {
            amount,
            currency,
            path: 'withdrawnValue'
          },
          onSuccess: (txHash) => {
            dispatch('txHashKeeper/updateDeposit', { amount, currency, netId, note, txHash }, { root: true })
          }
        },
        isAwait: false,
        isSaving: false
      }

      await dispatch('metamask/sendTransaction', callParams, { root: true })
    } catch (e) {
      console.error(e)
      throw new Error(e.message)
    }
  },
  loadAllNotesData({ dispatch, rootGetters }) {
    const { tokens } = rootGetters['metamask/networkConfig']

    for (const [currency, { instanceAddress }] of Object.entries(tokens)) {
      for (const amount in instanceAddress) {
        if (instanceAddress[amount]) {
          dispatch('updateLastIndex', { currency, amount })
        }
      }
    }
  },
  async updateLastIndex({ dispatch, commit, rootState }, { currency, amount }) {
    const netId = rootState.metamask.netId
    const { nextDepositIndex, anonymitySet } = await dispatch('getLastDepositIndex', {
      currency,
      netId,
      amount
    })

    commit('SAVE_LAST_INDEX', {
      amount,
      currency,
      anonymitySet,
      nextDepositIndex
    })
  },

  async loadEvent({ getters, rootGetters }, { note, type, eventName, eventToFind }) {
    try {
      const eventService = getters.eventsInterface.getService(note)

      const foundEvent = await eventService.findEvent({ eventName, eventToFind, type })

      return foundEvent
    } catch (err) {
      console.error(`Method loadEvent has error: ${err.message}`)
    }
  },
  async loadDepositEvent({ state, dispatch }, { withdrawNote }) {
    try {
      const note = parseNote(withdrawNote)
      console.log('note', note)

      const lastEvent = await dispatch('loadEvent', {
        note,
        eventName: 'commitment',
        type: eventsType.DEPOSIT,
        methodName: 'getAllDeposits',
        eventToFind: note.commitmentHex
      })

      console.log('lastEvent', lastEvent)

      if (lastEvent) {
        const { nextDepositIndex } = state.statistic[note.currency][note.amount]
        const depositsPast = nextDepositIndex - lastEvent.leafIndex - 1

        const isSpent = await dispatch('checkSpentEventFromNullifier', note)

        return {
          isSpent,
          depositsPast,
          timestamp: lastEvent.timestamp,
          leafIndex: lastEvent.leafIndex,
          txHash: lastEvent.transactionHash,
          depositBlock: lastEvent.blockNumber
        }
      }
    } catch (err) {
      console.error(`Method loadDepositEvent has error: ${err.message}`)
    }
  },
  async loadWithdrawalEvent({ dispatch }, { withdrawNote }) {
    try {
      const note = parseNote(withdrawNote)

      const lastEvent = await dispatch('loadEvent', {
        note,
        eventName: 'nullifierHash',
        type: eventsType.WITHDRAWAL,
        methodName: 'getAllWithdrawals',
        eventToFind: note.nullifierHex
      })

      if (lastEvent) {
        return {
          to: lastEvent.to,
          fee: lastEvent.fee,
          txHash: lastEvent.transactionHash,
          blockNumber: lastEvent.blockNumber
        }
      }
    } catch (err) {
      console.error(`Method loadWithdrawalEvent has error: ${err.message}`)
    }
  },
  async loadWithdrawalData({ commit, dispatch, rootGetters }, { withdrawNote }) {
    try {
      const toDecimals = rootGetters['token/toDecimals']

      const { currency, amount } = parseNote(withdrawNote)
      const { fee, txHash, blockNumber, to } = await dispatch('loadWithdrawalEvent', { withdrawNote })

      const decimals = rootGetters['metamask/networkConfig'].tokens[currency].decimals
      const withdrawalAmount = toBN(rootGetters['token/fromDecimals'](amount.toString(), decimals)).sub(
        toBN(fee)
      )

      return {
        to,
        txHash,
        withdrawalBlock: blockNumber,
        fee: toDecimals(fee, decimals, 4),
        amount: toDecimals(withdrawalAmount, decimals, 4)
      }
    } catch (e) {
      console.error(`Method loadWithdrawalData has error: ${e}`)
    }
  },
  calculateEthToReceive({ commit, state, rootGetters }, { currency }) {
    const gasLimit = rootGetters['metamask/networkConfig'].tokens[currency].gasLimit
    const gasPrice = toBN(rootGetters['gasPrices/gasPrice'])

    const ethToReceive = gasPrice
      .mul(toBN(gasLimit))
      .mul(toBN(2))
      .toString()
    return ethToReceive
  },
  async setDefaultEthToReceive({ dispatch, commit }, { currency }) {
    const ethToReceive = await dispatch('calculateEthToReceive', { currency })
    commit('SAVE_ETH_TO_RECEIVE', { ethToReceive })
    commit('SAVE_DEFAULT_ETH_TO_RECEIVE', { ethToReceive })
  },
  setNativeCurrency({ commit }, { netId }) {
    const currency = networkConfig[`netId${netId}`].nativeCurrency
    const amounts = Object.keys(networkConfig[`netId${netId}`].tokens[currency].instanceAddress)
    const amount = Math.min(...amounts)

    commit('SET_SELECTED_INSTANCE', { currency, amount })
    commit('SET_SELECTED_STATISTIC', { currency, amount })
  },
  async aggregateMulticall({ rootGetters, getters }, { params }) {
    try {
      const netId = rootGetters['metamask/netId']
      const multicallContract = getters.multicallContract({ netId })

      const result = await multicallContract.methods.aggregate(params).call()

      return result.returnData
    } catch (err) {
      console.log('err', err.message)
    }
  }
}
export default {
  namespaced: true,
  state,
  getters,
  mutations,
  actions
}
