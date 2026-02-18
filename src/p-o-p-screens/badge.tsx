import { useEffect, useState } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
  Image,
} from "react-native";
import { transact } from "@solana-mobile/mobile-wallet-adapter-protocol-web3js";
import { PublicKey } from "@solana/web3.js";
import { usePOPProgram } from "../p-o-p/p-o-p-data-access";

const HELIUS_URL = process.env.EXPO_PUBLIC_HELIUS_URL as string;

// interface Badge {
//   id: string;
//   name: string;
//   image?: string;
// }

interface Badge {
    id: string
    name: string
    checkedInAt: number
    event: string
}

export default function BadgesScreen() {
  const [badges, setBadges] = useState<Badge[]>([]);
  const [loading, setLoading] = useState(false);
    const [walletAddress, setWalletAddress] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const { program } = usePOPProgram();

    // Auto-fetch once wallet is connected
    useEffect(() => {
        if (walletAddress) {
        fetchBadges(walletAddress);
        }
    }, [walletAddress]);

    async function connectAndFetch() {
        setLoading(true);
        setError(null);
        try {
            await transact(async (wallet) => {
                const authResult = await wallet.authorize({
                    cluster: "devnet",
                    identity: {
                        name: "Proof of Presence",
                        uri: "https://github.com/NeelContractor/solana-mobile-app/blob/main/assets/badge-metadata.json",
                        icon: "/favicon.ico",
                    },
                });

                // ✅ base64 → PublicKey (same fix as check-in)
                const pubkey = new PublicKey(
                    Buffer.from(authResult.accounts[0].address, "base64")
                );
                console.log("pubkey: ", pubkey.toBase58());
                setWalletAddress(pubkey.toString());
            });
        } catch (err: any) {
            console.error("Wallet connect error:", err);
            setError("Failed to connect wallet.");
            setLoading(false);
        }
    }

    // async function fetchBadges(ownerAddress: string) {
    //     setLoading(true);
    //     setError(null);
    //     try {
    //         const res = await fetch(HELIUS_URL, {
    //             method: "POST",
    //             headers: { "Content-Type": "application/json" },
    //             body: JSON.stringify({
    //                 jsonrpc: "2.0",
    //                 id: "badges",
    //                 method: "getAssetsByOwner",
    //                 params: {
    //                     ownerAddress,
    //                     page: 1,
    //                     limit: 50,
    //                 },
    //             }),
    //         });

    //         const { result } = await res.json();

    //         if (!result?.items) {
    //             setError("No data returned from Helius.");
    //             return;
    //         }

    //         // Filter only POP badges
    //         const pop: Badge[] = result.items
    //             .filter((a: any) => a.content?.metadata?.symbol === "POP")
    //             .map((a: any) => ({
    //                 id: a.id,
    //                 name: a.content?.metadata?.name ?? "POP Badge",
    //                 image: a.content?.links?.image ?? null,
    //             }));
    //         console.log(pop);

    //         setBadges(pop);

    //         if (pop.length === 0) {
    //             setError("No badges found. Check in to an event to earn one!");
    //         }
    //     } catch (err: any) {
    //         console.error("Fetch badges error:", err);
    //         setError("Failed to load badges. Try again.");
    //     } finally {
    //         setLoading(false);
    //     }
    // }

    async function fetchBadges(ownerAddress: string) {
        setLoading(true)
        setError(null)
        try {
            const accounts = await program.account.attendance.all([
                { memcmp: { offset: 8, bytes: ownerAddress } }
            ])
    
            if (accounts.length === 0) {
                setError("No check-ins yet. Attend an event to earn a badge!")
                setBadges([])
                return
            }
    
            const pop = accounts.map((acc) => ({
                id: acc.publicKey.toString(),
                name: `Attendance Badge`,
                checkedInAt: acc.account.checkedInAt.toNumber(),
                event: acc.account.event.toString(),
            }))
            console.log(pop)
    
            setBadges(pop)
        } catch (err: any) {
            console.error("Fetch error:", err?.message)
            setError("Failed to load badges.")
        } finally {
            setLoading(false)
        }
    }

    if (!walletAddress) {
        return (
        <View style={styles.centered}>
            <Text style={styles.title}>My Badges</Text>
            <Text style={styles.subtitle}>Connect your wallet to see your badges</Text>
            <TouchableOpacity style={styles.button} onPress={connectAndFetch} disabled={loading}>
            {loading ? (
                <ActivityIndicator color="#fff" />
            ) : (
                <Text style={styles.buttonText}>Connect Wallet</Text>
            )}
            </TouchableOpacity>
            {error && <Text style={styles.error}>{error}</Text>}
        </View>
        );
    }

    return (
        <View style={styles.container}>
            <Text style={styles.title}>My Badges</Text>

            {/* Wallet address */}
            <Text style={styles.wallet} numberOfLines={1} ellipsizeMode="middle">
                {walletAddress}
            </Text>

            {/* Refresh button */}
            <TouchableOpacity
                style={styles.refreshButton}
                onPress={() => fetchBadges(walletAddress)}
                disabled={loading}
            >
                <Text style={styles.refreshText}>{loading ? "Loading..." : "🔄 Refresh"}</Text>
            </TouchableOpacity>

            {error && <Text style={styles.error}>{error}</Text>}

            {loading ? (
                <ActivityIndicator color="#9945FF" size="large" style={{ marginTop: 48 }} />
            ) : (
                <FlatList
                    data={badges}
                    numColumns={2}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={styles.grid}
                    ListEmptyComponent={
                        <Text style={styles.empty}>No badges yet. Check in to earn one!</Text>
                    }
                    renderItem={({ item }) => (
                        <View style={styles.badge}>
                            <View style={styles.badgePlaceholder}>
                                <Text style={styles.badgeEmoji}>🏅</Text>
                            </View>
                            <Text style={styles.badgeName}>{item.name}</Text>
                            <Text style={{ color: "#666", fontSize: 10, textAlign: "center" }}>
                                {new Date(item.checkedInAt * 1000).toLocaleDateString()}
                            </Text>
                        </View>
                    )}
                    // renderItem={({ item }) => (
                    //     <View style={styles.badge}>
                    //         {item.image ? (
                    //             <Image source={{ uri: item.image }} style={styles.badgeImage} />
                    //         ) : (
                    //             <View style={styles.badgePlaceholder}>
                    //             <Text style={styles.badgeEmoji}>🏅</Text>
                    //             </View>
                    //         )}
                    //         <Text style={styles.badgeName} numberOfLines={2}>
                    //             {item.name}
                    //         </Text>
                    //     </View>
                    // )}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: "#0f0f23",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "#0f0f23",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#9945FF",
    marginBottom: 4,
  },
  subtitle: {
    color: "#888",
    fontSize: 14,
    marginBottom: 32,
    textAlign: "center",
  },
  wallet: {
    color: "#555",
    fontSize: 11,
    marginBottom: 12,
  },
  refreshButton: {
    alignSelf: "flex-end",
    paddingVertical: 6,
    paddingHorizontal: 14,
    backgroundColor: "#1a1a3e",
    borderRadius: 8,
    marginBottom: 16,
  },
  refreshText: {
    color: "#9945FF",
    fontSize: 13,
    fontWeight: "600",
  },
  grid: {
    paddingBottom: 32,
  },
  badge: {
    flex: 1,
    margin: 8,
    padding: 16,
    backgroundColor: "#1a1a3e",
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#2a2a5e",
  },
  badgeImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: 8,
  },
  badgePlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#2a2a5e",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  badgeEmoji: {
    fontSize: 36,
  },
  badgeName: {
    color: "#fff",
    textAlign: "center",
    fontSize: 12,
    fontWeight: "600",
  },
  button: {
    backgroundColor: "#9945FF",
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 12,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  error: {
    color: "#ff6b6b",
    fontSize: 13,
    marginTop: 12,
    textAlign: "center",
  },
  empty: {
    color: "#555",
    textAlign: "center",
    marginTop: 48,
    fontSize: 14,
  },
});