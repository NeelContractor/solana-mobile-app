const { createUmi } = require("@metaplex-foundation/umi-bundle-defaults");
const { createTree, mplBubblegum } = require("@metaplex-foundation/mpl-bubblegum");
const { keypairIdentity, generateSigner } = require("@metaplex-foundation/umi");
const { fromWeb3JsKeypair } = require("@metaplex-foundation/umi-web3js-adapters");
const { Keypair, clusterApiUrl } = require("@solana/web3.js");
const fs = require("fs");

async function main() {
    const umi = createUmi(clusterApiUrl("devnet")).use(mplBubblegum());

    // Load your local Solana keypair
    const rawKeypair = JSON.parse(
        fs.readFileSync(`${process.env.HOME}/.config/solana/id.json`, "utf-8")
    );
    const signer = Keypair.fromSecretKey(Uint8Array.from(rawKeypair));
    umi.use(keypairIdentity(fromWeb3JsKeypair(signer)));

    console.log("Wallet:", signer.publicKey.toString());

  // Make sure you have devnet SOL
    const merkleTree = generateSigner(umi);

    const builder = await createTree(umi, {
        merkleTree,
        maxDepth: 14,
        maxBufferSize: 64,
        canopyDepth: 0,
    });

    await builder.sendAndConfirm(umi);

    console.log("\n✅ Merkle Tree created!");
    console.log("YOUR_MERKLE_TREE_ADDRESS =", merkleTree.publicKey);
}

main().catch(console.error);