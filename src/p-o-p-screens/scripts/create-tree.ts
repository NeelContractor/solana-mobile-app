import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { createTree, mplBubblegum } from "@metaplex-foundation/mpl-bubblegum";
import { keypairIdentity } from "@metaplex-foundation/umi";
import { clusterApiUrl } from "@solana/web3.js";

const umi = createUmi(clusterApiUrl("devnet")).use(mplBubblegum());
// Load your organizer keypair here
// umi.use(keypairIdentity(yourKeypair));

const merkleTree = await createTree(umi, {
  maxDepth: 14,        // supports 16,384 NFTs
  maxBufferSize: 64,
  canopyDepth: 0,
});

console.log("Merkle Tree:", merkleTree.publicKey);
// Save this address — you'll use it for minting