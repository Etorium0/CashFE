import { hexToBigint, bigintToHex, leBigintToBuffer } from './proofGenerator/utils/bigint.js'
import { pedersenHash } from './proofGenerator/utils/pedersen.js'
import { mimicMerkleTree } from './proofGenerator/utils/mimcMerkleTree.js'
const { groth16 } = require('snarkjs')

// Intended output: (uint256[2] memory pA, uint256[2][2] memory pB, uint256[2] memory pC, bytes32 root, bytes32 nullifierHash)

async function generateWitness(nullifier, secret, recipient, relayer, leaves, fee, refund) {
  // Convert hex string leaves to BigInt format
  const formattedLeaves = []

  // Convert hex string leaves to BigInt format
  if (Array.isArray(leaves) && leaves.length > 0) {
    for (const leaf of leaves) {
      formattedLeaves.push(hexToBigint(leaf))
    }
  } else {
    console.warn('No leaves provided for Merkle tree, using empty array')
  }

  // Use the formatted leaves instead of the input leaves
  leaves = formattedLeaves

  const nullifierHash = await pedersenHash(leBigintToBuffer(nullifier, 31))
  const tree = await mimicMerkleTree(leaves)
  const commitment = await pedersenHash(
    Buffer.concat([leBigintToBuffer(nullifier, 31), leBigintToBuffer(secret, 31)])
  )
  const merkleProof = tree.proof(commitment)
  // 4. Format witness input to exactly match circuit expectations
  const input = {
    // Public inputs
    root: merkleProof.pathRoot,
    nullifierHash,
    recipient: hexToBigint(recipient),
    relayer: hexToBigint(relayer),
    fee: BigInt(fee),
    refund: BigInt(refund),

    // Private inputs
    nullifier,
    secret,
    pathElements: merkleProof.pathElements.map((x) => x.toString()),
    pathIndices: merkleProof.pathIndices
  }

  // Use URLs instead of file paths
  const wasmPath = '/circuit_artifacts/withdraw.wasm'
  const zkeyPath = '/circuit_artifacts/withdraw_final.zkey'

  console.log('wasmPath', wasmPath)
  console.log('zkeyPath', zkeyPath)

  const { proof } = await groth16.fullProve(input, wasmPath, zkeyPath)

  const pA = proof.pi_a.slice(0, 2)
  const pB = proof.pi_b.slice(0, 2)
  const pC = proof.pi_c.slice(0, 2)

  return {
    pA,
    pB: [
      [pB[0][1], pB[0][0]],
      [pB[1][1], pB[1][0]]
    ],
    pC,
    root: bigintToHex(merkleProof.pathRoot),
    nullifierHash: bigintToHex(nullifierHash)
  }
}

export { generateWitness }
