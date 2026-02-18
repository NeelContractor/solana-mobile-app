const express = require("express");
const { createUmi } = require("@metaplex-foundation/umi-bundle-defaults");
const { mintV1, mplBubblegum } = require("@metaplex-foundation/mpl-bubblegum");
const { keypairIdentity, publicKey, generateSigner } = require("@metaplex-foundation/umi");
const { fromWeb3JsKeypair } = require("@metaplex-foundation/umi-web3js-adapters");
const { Keypair, clusterApiUrl } = require("@solana/web3.js");
const fs = require("fs");

const app = express();
app.use(express.json());

// Load your Solana keypair
const rawKeypair = JSON.parse(
  fs.readFileSync(`${process.env.HOME}/.config/solana/id.json`, "utf-8")
);
const signer = Keypair.fromSecretKey(Uint8Array.from(rawKeypair));

const umi = createUmi(clusterApiUrl("devnet"))
  .use(mplBubblegum())
  .use(keypairIdentity(fromWeb3JsKeypair(signer)));

// ✅ Replace with your Merkle tree address from create-tree script
const MERKLE_TREE = publicKey("5vpGA6PhqEWXdvGG5aoo18aYfqvGtFPpmzDyNy4qQsdn");

app.post("/mint", async (req, res) => {
  const { walletAddress, eventName } = req.body;
  console.log(`Minting badge for ${walletAddress} — event: ${eventName}`);
  try {
    await mintV1(umi, {
      leafOwner: publicKey(walletAddress),
      merkleTree: MERKLE_TREE,
      metadata: {
        name: `${eventName} Attendance Badge`,
        symbol: "POP",
        uri: "https://yourapp.com/badge-metadata.json",
        sellerFeeBasisPoints: 0,
        collection: { key: publicKey("11111111111111111111111111111111"), verified: false },
        creators: [],
      },
    }).sendAndConfirm(umi);

    console.log("✅ Badge minted!");
    res.json({ success: true });
  } catch (err) {
    console.error("Mint error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(3000, "0.0.0.0", () => {
  console.log("🚀 Mint server running on :3000");
});