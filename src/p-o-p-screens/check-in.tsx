import { Connection, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { useState } from "react";
import * as Location from "expo-location";
import { transact } from "@solana-mobile/mobile-wallet-adapter-protocol-web3js";
import * as anchor from "@coral-xyz/anchor";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import IDL from "../../proof-of-presence/target/idl/proof_of_presence.json";

const PROGRAM_ID = new PublicKey(process.env.EXPO_PUBLIC_PROGRAM_ID);
const MINT_SERVER_URL = process.env.EXPO_PUBLIC_MINT_SERVER_URL;
const EVENT_NAME = "Solana Hackathon Demo";
const EVENT_ORGANIZER = new PublicKey(process.env.EXPO_PUBLIC_EVENT_ORGANIZER);

export default function CheckInScreen() {
    const [status, setStatus] = useState<string>("Ready to check in");
    const [loading, setLoading] = useState(false);

    async function handleCheckIn() {
        setLoading(true);
        setStatus("Getting your location...");

        try {
            // 1. GPS
            const { status: permStatus } = await Location.requestForegroundPermissionsAsync();
            if (permStatus !== "granted") {
                Alert.alert("Permission denied", "Location access is required to check in.");
                setLoading(false);
                return;
            }

            const location = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.High,
            });

            const userLat = Math.round(location.coords.latitude * 1_000_000);
            const userLng = Math.round(location.coords.longitude * 1_000_000);
            console.log("GPS:", location.coords.latitude, location.coords.longitude);

            setStatus("Connecting to wallet...");

            await transact(async (wallet) => {
                // ✅ Fresh connection created inside transact — avoids stale hook state
                const conn = new Connection("https://api.devnet.solana.com", {
                    commitment: "confirmed",
                });

                // 2. Authorize wallet
                const authResult = await wallet.authorize({
                    cluster: "devnet",
                    identity: {
                        name: "Proof of Presence",
                        uri: "https://yourapp.com",
                        icon: "/favicon.ico",
                    },
                });

                const userPubkey = new PublicKey(
                    Buffer.from(authResult.accounts[0].address, "base64")
                );
                console.log("Wallet:", userPubkey.toString());

                // 3. Derive PDAs
                const [eventPDA] = PublicKey.findProgramAddressSync(
                    [Buffer.from("event"), EVENT_ORGANIZER.toBuffer(), Buffer.from(EVENT_NAME)],
                    PROGRAM_ID
                );
                console.log("Event PDA:", eventPDA.toString());

                const [attendancePDA] = PublicKey.findProgramAddressSync(
                    [Buffer.from("attendance"), eventPDA.toBuffer(), userPubkey.toBuffer()],
                    PROGRAM_ID
                );
                console.log("Attendance PDA:", attendancePDA.toString());

                // 4. Build Anchor instruction
                const provider = new anchor.AnchorProvider(
                    conn,
                    {
                        publicKey: userPubkey,
                        signTransaction: async () => { throw new Error("unused"); },
                        signAllTransactions: async () => { throw new Error("unused"); },
                    },
                    { commitment: "confirmed" }
                );

                const program = new anchor.Program(IDL as anchor.Idl, provider);

                const ix = await program.methods
                    .checkIn(new anchor.BN(userLat), new anchor.BN(userLng))
                    .accountsStrict({
                        event: eventPDA,
                        attendance: attendancePDA,
                        attendee: userPubkey,
                        systemProgram: SystemProgram.programId,
                    })
                    .instruction();

                // 5. Build transaction
                const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
                console.log("Blockhash:", blockhash);

                const tx = new Transaction({
                    recentBlockhash: blockhash,
                    feePayer: userPubkey,
                }).add(ix);

                console.log("Transaction built, requesting wallet approval...");
                setStatus("Please approve in your wallet...");

                // 6. Sign and send in one call inside wallet session
                const signatures = await wallet.signAndSendTransactions({
                    transactions: [tx],
                });
                const sig = signatures[0];
                console.log("Transaction sent:", sig);

                // 7. Confirm
                setStatus("Confirming on-chain...");
                await conn.confirmTransaction(
                    { signature: sig, blockhash, lastValidBlockHeight },
                    "confirmed"
                );
                console.log("Confirmed!");

                // 8. Mint badge via server
                setStatus("Minting your badge...");
                const mintRes = await fetch(MINT_SERVER_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        walletAddress: userPubkey.toString(),
                        eventName: EVENT_NAME,
                    }),
                });
                console.log("Mint response:", mintRes.status);

                setStatus("🎉 Checked in & badge minted!");
            });

        } catch (err: any) {
            console.error("Error name:", err?.name);
            console.error("Error message:", err?.message);
            console.error("Error logs:", err?.logs);
            console.error("Error stack:", err?.stack);

            const msg = err?.message || err?.name || String(err) || "Unknown error";

            if (msg.includes("OutOfRange")) {
                setStatus("❌ You're not at the event location.");
            } else if (msg.includes("AlreadyCheckedIn")) {
                setStatus("⚠️ You already checked in!");
            } else if (msg.includes("EventNotActive")) {
                setStatus("⏰ Event is not active. Create a new event first.");
            } else {
                setStatus(`❌ ${msg}`);
            }
        } finally {
            setLoading(false);
        }
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
    container: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: "#0f0f23" },
    title: { fontSize: 28, fontWeight: "bold", color: "#9945FF", marginBottom: 8 },
    subtitle: { fontSize: 18, color: "#fff", marginBottom: 32 },
    status: { fontSize: 14, color: "#aaa", marginBottom: 32, textAlign: "center" },
    button: { backgroundColor: "#9945FF", paddingVertical: 16, paddingHorizontal: 48, borderRadius: 12 },
    buttonDisabled: { opacity: 0.5 },
    buttonText: { color: "#fff", fontSize: 18, fontWeight: "bold" },
});