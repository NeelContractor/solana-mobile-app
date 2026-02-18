import { clusterApiUrl, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { useState } from "react";
import { useConnection } from "../utils/ConnectionProvider";
import * as Location from "expo-location";
import { transact } from "@solana-mobile/mobile-wallet-adapter-protocol-web3js";
import * as anchor from "@coral-xyz/anchor";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { mintV1, mplBubblegum } from "@metaplex-foundation/mpl-bubblegum";
import { publicKey as umiPublicKey } from "@metaplex-foundation/umi";

// Proof of Presence
const PROGRAM_ID = new PublicKey("5FGBLn94L7dpNzvAG5vwBc2wqLVBkpT1kkers5om5sBv");

// IDL 
import IDL from "../../proof-of-presence/target/idl/proof_of_presence.json"
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function CheckInScreen() {
    const { connection } = useConnection()
    const [status, setStatus] = useState<string>("Ready to check in");
    const [loading, setLoading] = useState(false);

    // TODO change this to real logic
    // Hardcoded for MVP - in production fetch from on-chain event list
    const EVENT_NAME = "Solana Hackathon Demo"
    const EVENT_ORGANIZER = new PublicKey("ORGANIZER_WALLET_PUBKEY");

    async function handleCheckIn() {
        setLoading(true);
        setStatus("Getting you location...");

        try {
            // 1. Get GPS location
            const { status: permStatus } = await Location.requestForegroundPermissionsAsync();
            if (permStatus !== "granted") {
                Alert.alert("Permission denied", "Location access is required to check in.");
                return;
            }

            const location = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.High,
            });

            const userLat = Math.round(location.coords.latitude * 1_000_000);
            const userLng = Math.round(location.coords.longitude * 1_000_000);

            setStatus("Connecting to wallet...")

            // 2. Transact with wallet via Mobile Wallet Adapter
            await transact(async (wallet) => {
                const authResult = await wallet.authorize({
                    cluster: "devnet",
                    identity: {
                        name: "Proof of Presence",
                        uri: "https://yourapp.com",
                        icon: "/favicon.ico",
                    }
                });

                const userPubkey = new PublicKey(authResult.accounts[0].address);

                // 3. Derive PDAs
                const [eventPDA] = PublicKey.findProgramAddressSync(
                    [Buffer.from("event"), EVENT_ORGANIZER.toBuffer(), Buffer.from(EVENT_NAME)],
                    PROGRAM_ID,
                );

                const [attendancePDA] = PublicKey.findProgramAddressSync(
                    [Buffer.from("attendance"), eventPDA.toBuffer(), userPubkey.toBuffer()],
                    PROGRAM_ID
                );

                // 4. Build Anchro instruction
                const provider = new anchor.AnchorProvider(
                    connection,
                    {
                        publicKey: userPubkey,
                        signTransaction: async () => { throw new Error("unused") },
                        signAllTransactions: async () => { throw new Error("unused") },
                    },
                    { commitment: "confirmed" }
                );

                const program = new anchor.Program(IDL as anchor.Idl, PROGRAM_ID, provider)

                const ix = await program.methods
                    .checkIn(new anchor.BN(userLat), new anchor.BN(userLng))
                    .accountsStrict({
                        event: eventPDA,
                        attendance: attendancePDA,
                        attendee: userPubkey,
                        systemProgram: SystemProgram.programId
                    })
                    .instruction();
                
                // 5. Build and sign transaction
                const { blockhash } = await connection.getLatestBlockhash();
                const tx = new Transaction({
                    recentBlockhash: blockhash,
                    feePayer: userPubkey,
                }).add(ix);

                setStatus("Please approve in your wallet...");
                
                const signedTxs = await wallet.signTransactions({
                    transactions: [tx],
                });

                // 6. Send and confirm
                setStatus("Confirming on-chain...");
                const sig = await connection.sendRawTransaction(
                    signedTxs[0].serialize()
                );
                await connection.confirmTransaction(sig, "confirmed");

                setStatus("Checked in! Minting your badge...");
                await mintBadge(userPubkey, eventPDA, wallet);
            })
        } catch (err: any) {
            console.error(err);
            if (err.message?.includes("OutOfRange")) {
                setStatus("You're not at the event location.")
            } else if (err.message?.includes("AlreadyCheckedIn")) {
                setStatus("You already checked in!");
            } else {
                setStatus("Something went wrong. Try again.");
            }
        } finally {
            setLoading(false);
        }
    }

    async function mintBadge(userPubkey: PublicKey, eventPDA: PublicKey, wallet: any) {
        const umi = createUmi(clusterApiUrl("devnet")).use(mplBubblegum());
        // Minting a cNFT via Metaplex Bubblegum
        // For hackathon MVP: use Metaplex JS SDK with UMI
        // This is where you call Bubblegum's mintV1 instruction
        // pointing to a pre-created merkle tree on devnet
        // See Step 6 below for full implementation

        const MERKLE_TREE = umiPublicKey("YOUR_MERKLE_TREE_ADDRESS");

        await mintV1(umi, {
            leafOwner: umiPublicKey(userPubkey.toString()),
            merkleTree: MERKLE_TREE,
            metadata: {
                name: `${EVENT_NAME} Attendance Badge`,
                symbol: "POP",
                uri: "https://yourapp.com/badge-metadata.json", // host this JSON on IPFS/Arweave
                sellerFeeBasisPoints: 0,
                collection: { key: umiPublicKey("11111111111111111111111111111111"), verified: false },
                creators: [],
            },
        }).sendAndConfirm(umi);

        setStatus("🎉 Badge minted! Check your wallet."); // TODO: complete logic
    }

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Proof of Presence</Text>
            <Text style={styles.subtitle}>{EVENT_NAME}</Text>
            <Text style={styles.status}>{status}</Text>
            <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleCheckIn}
                disabled={loading}
            >
                <Text style={styles.buttonText}>
                {loading ? "Processing..." : "Check In & Mint Badge"}
                </Text>
            </TouchableOpacity>
        </View>
    );
}
const styles = StyleSheet.create({
    container: { 
        flex: 1, 
        justifyContent: "center", 
        alignItems: "center", 
        padding: 24, 
        backgroundColor: "#0f0f23" 
    },
    title: { 
        fontSize: 28, 
        fontWeight: "bold", 
        color: "#9945FF", 
        marginBottom: 8 
    },
    subtitle: { 
        fontSize: 18, 
        color: "#fff", 
        marginBottom: 32 
    },
    status: { 
        fontSize: 14, 
        color: "#aaa", 
        marginBottom: 32, 
        textAlign: "center" 
    },
    button: { 
        backgroundColor: "#9945FF", 
        paddingVertical: 16, 
        paddingHorizontal: 48, 
        borderRadius: 12 
    },
    buttonDisabled: { 
        opacity: 0.5 
    },
    buttonText: { 
        color: "#fff", 
        fontSize: 18, 
        fontWeight: "bold" 
    },
});