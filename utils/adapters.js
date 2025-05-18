import { eventsType } from '@/constants'

export function formatEvents(events, type) {
  if (type === eventsType.DEPOSIT) {
    return events.map((event) => {
      return {
        blockNumber: event.blockNumber ? event.blockNumber : event.BlockNumber,
        transactionHash: event.transactionHash ? event.transactionHash : event.TxHash,
        commitment: event.commitment ? event.commitment : event.Commitments,
        leafIndex: Number(event.index ? event.index : event.LeafIndex),
        timestamp: event.timestamp ? event.timestamp : event.Timestamp
      }
    })
  } else {
    return events.map((event) => {
      return {
        blockNumber: event.blockNumber ? event.blockNumber : event.BlockNumber,
        transactionHash: event.transactionHash ? event.transactionHash : event.TxHash,
        nullifierHash: event.nullifier ? event.nullifier : event.NullifierHash,
        to: event.to ? event.to : event.Recipient,
        fee: event.fee ? event.fee : event.Fee
      }
    })
  }
}

export function formatEvent(event, type) {
  if (type === eventsType.DEPOSIT) {
    return {
      timestamp: event.timestamp ? event.timestamp : event.Timestamp,
      commitment: event.commitment ? event.commitment : event.Commitments,
      leafIndex: Number(event.index ? event.index : event.LeafIndex),
      blockNumber: event.blockNumber ? event.blockNumber : event.BlockNumber,
      transactionHash: event.transactionHash ? event.transactionHash : event.TxHash
    }
  } else {
    return {
      to: event.to ? event.to : event.Recipient,
      fee: event.fee ? event.fee : event.Fee,
      nullifierHash: event.nullifier ? event.nullifier : event.NullifierHash,
      blockNumber: Number(event.blockNumber ? event.blockNumber : event.BlockNumber),
      transactionHash: event.transactionHash ? event.transactionHash : event.TxHash
    }
  }
}
