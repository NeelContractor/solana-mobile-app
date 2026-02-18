import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native'
import * as Location from 'expo-location'
import { transact } from '@solana-mobile/mobile-wallet-adapter-protocol-web3js'
import { PublicKey, Transaction } from '@solana/web3.js'
import { usePOPProgram } from '../p-o-p/p-o-p-data-access'
import { useConnection } from '../utils/ConnectionProvider'

type Status = 'idle' | 'loading' | 'success' | 'error'

interface FormState {
    name: string
    radiusMeters: string
    durationHours: string
}

export default function CreateEventScreen() {
    const { connection } = useConnection()
    const { buildCreateEventIx, allEvents } = usePOPProgram()

    const [form, setForm] = useState<FormState>({
        name: '',
        radiusMeters: '100',
        durationHours: '4',
    })
    const [status, setStatus] = useState<Status>('idle')
    const [statusMsg, setStatusMsg] = useState('Fill in your event details below.')
    const [txSig, setTxSig] = useState<string | null>(null)


    const updateField = (key: keyof FormState) => (val: string) =>
        setForm((prev) => ({ ...prev, [key]: val }))

    const isFormValid =
        form.name.trim().length > 0 &&
        Number(form.radiusMeters) > 0 &&
        Number(form.durationHours) > 0

    async function handleCreateEvent() {
        if (!isFormValid) {
            Alert.alert('Missing fields', 'Please fill in all fields correctly.')
            return
        }

        setStatus('loading')

        try {
            // 1. Get organizer's current GPS location as event location
            setStatusMsg('Getting your GPS location...')
            const { status: permStatus } = await Location.requestForegroundPermissionsAsync()
            if (permStatus !== 'granted') {
                Alert.alert('Permission denied', 'Location access is required to create an event.')
                setStatus('error')
                setStatusMsg('Location permission denied.')
                return
            }

            const location = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.High,
            })

            const { latitude, longitude } = location.coords
            const now = new Date()
            const endsAt = new Date(now.getTime() + Number(form.durationHours) * 60 * 60 * 1000)

            setStatusMsg('Building transaction...')

            // 2. Connect wallet & build + send transaction
            await transact(async (wallet) => {
                // Authorize
                const authResult = await wallet.authorize({
                    cluster: 'devnet',
                    identity: {
                        name: 'Proof of Presence',
                        uri: 'https://yourapp.com',
                        icon: '/favicon.ico',
                    },
                })

                const organizerPubkey = new PublicKey(authResult.accounts[0].address)

                // Build the create_event instruction
                const { ix } = await buildCreateEventIx({
                    organizerPubkey,
                    name: form.name.trim(),
                    lat: latitude,
                    lng: longitude,
                    radiusMeters: Number(form.radiusMeters),
                    startsAt: now,
                    endsAt,
                })

                // Assemble transaction
                const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
                const tx = new Transaction({
                    recentBlockhash: blockhash,
                    feePayer: organizerPubkey,
                }).add(ix)

                setStatusMsg('Please approve in your wallet...')

                // Sign via MWA
                const [signedTx] = await wallet.signTransactions({ transactions: [tx] })

                setStatusMsg('Confirming on-chain...')

                // Broadcast
                const sig = await connection.sendRawTransaction(signedTx.serialize())
                await connection.confirmTransaction(
                    { signature: sig, blockhash, lastValidBlockHeight },
                    'confirmed'
                )

                setTxSig(sig)
            })

            // 3. Success
            setStatus('success')
            setStatusMsg('🎉 Event created successfully!')
            allEvents.refetch()

        } catch (err: unknown) {
            console.error('Create event error:', err)
            setStatus('error')

            if (err instanceof Error) {
                if (err.message.includes('User rejected')) {
                    setStatusMsg('Transaction rejected in wallet.')
                } else {
                    setStatusMsg(`Error: ${err.message}`)
                }
            } else {
                setStatusMsg('Something went wrong. Please try again.')
            }
        }
    }

    function handleReset() {
        setForm({ name: '', radiusMeters: '100', durationHours: '4' })
        setStatus('idle')
        setStatusMsg('Fill in your event details below.')
        setTxSig(null)
    }

    return (
        <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        >
        <Text style={styles.title}>Create Event</Text>
        <Text style={styles.subtitle}>
            Your current GPS location will be saved as the event check-in point.
        </Text>

        {/* Status Banner */}
        <View style={[styles.banner, statusStyles[status]]}>
            {status === 'loading' && (
            <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />
            )}
            <Text style={styles.bannerText}>{statusMsg}</Text>
        </View>

        {/* Success State */}
        {status === 'success' ? (
            <View style={styles.successCard}>
            <Text style={styles.successTitle}>Event is Live 🚀</Text>
            <Text style={styles.successName}>{form.name}</Text>
            {txSig && (
                <Text style={styles.successTx} numberOfLines={1} ellipsizeMode="middle">
                Tx: {txSig}
                </Text>
            )}
            <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
                <Text style={styles.resetButtonText}>Create Another Event</Text>
            </TouchableOpacity>
            </View>
        ) : (
            <>
            {/* Event Name */}
            <View style={styles.field}>
                <Text style={styles.label}>Event Name</Text>
                <TextInput
                style={styles.input}
                placeholder="e.g. Solana Hackathon Delhi"
                placeholderTextColor="#555"
                value={form.name}
                onChangeText={updateField('name')}
                maxLength={64}
                editable={status !== 'loading'}
                />
                <Text style={styles.hint}>{form.name.length}/64 characters</Text>
            </View>

            {/* Check-in Radius */}
            <View style={styles.field}>
                <Text style={styles.label}>Check-in Radius (meters)</Text>
                <View style={styles.presetRow}>
                {['50', '100', '200', '500'].map((v) => (
                    <TouchableOpacity
                    key={v}
                    style={[styles.preset, form.radiusMeters === v && styles.presetActive]}
                    onPress={() => updateField('radiusMeters')(v)}
                    disabled={status === 'loading'}
                    >
                    <Text style={[styles.presetText, form.radiusMeters === v && styles.presetTextActive]}>
                        {v}m
                    </Text>
                    </TouchableOpacity>
                ))}
                </View>
                <TextInput
                style={styles.input}
                placeholder="Or enter custom radius"
                placeholderTextColor="#555"
                value={form.radiusMeters}
                onChangeText={updateField('radiusMeters')}
                keyboardType="numeric"
                editable={status !== 'loading'}
                />
            </View>

            {/* Event Duration */}
            <View style={styles.field}>
                <Text style={styles.label}>Event Duration (hours)</Text>
                <View style={styles.presetRow}>
                {['1', '2', '4', '8'].map((v) => (
                    <TouchableOpacity
                    key={v}
                    style={[styles.preset, form.durationHours === v && styles.presetActive]}
                    onPress={() => updateField('durationHours')(v)}
                    disabled={status === 'loading'}
                    >
                    <Text style={[styles.presetText, form.durationHours === v && styles.presetTextActive]}>
                        {v}h
                    </Text>
                    </TouchableOpacity>
                ))}
                </View>
                <TextInput
                style={styles.input}
                placeholder="Or enter custom hours"
                placeholderTextColor="#555"
                value={form.durationHours}
                onChangeText={updateField('durationHours')}
                keyboardType="numeric"
                editable={status !== 'loading'}
                />
            </View>

            {/* Info Box */}
            <View style={styles.infoBox}>
                <Text style={styles.infoTitle}>📍 How it works</Text>
                <Text style={styles.infoText}>
                • Your phone's GPS location right now becomes the event center.{'\n'}
                • Attendees must be within <Text style={styles.infoHighlight}>{form.radiusMeters || '?'}m</Text> to check in.{'\n'}
                • Event will be active for <Text style={styles.infoHighlight}>{form.durationHours || '?'} hour(s)</Text> from creation.{'\n'}
                • A check-in window is recorded on-chain — no edits possible after.
                </Text>
            </View>

            {/* Submit Button */}
            <TouchableOpacity
                style={[styles.button, (!isFormValid || status === 'loading') && styles.buttonDisabled]}
                onPress={handleCreateEvent}
                disabled={!isFormValid || status === 'loading'}
            >
                {status === 'loading' ? (
                <ActivityIndicator color="#fff" />
                ) : (
                <Text style={styles.buttonText}>📍 Create Event On-Chain</Text>
                )}
            </TouchableOpacity>
            </>
        )}
        </ScrollView>
    )
}

// ── Status banner colors ───────────────────────────────────────────────────────
const statusStyles: Record<Status, object> = {
    idle: { backgroundColor: '#1a1a3e' },
    loading: { backgroundColor: '#2a2a5e' },
    success: { backgroundColor: '#0d3320' },
    error: { backgroundColor: '#3a0d0d' },
}

const styles = StyleSheet.create({
    scroll: {
        flex: 1,
        backgroundColor: '#0f0f23',
    },
    container: {
        padding: 24,
        paddingBottom: 48,
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#9945FF',
        marginBottom: 6,
    },
    subtitle: {
        fontSize: 14,
        color: '#888',
        marginBottom: 20,
        lineHeight: 20,
    },
    banner: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 10,
        marginBottom: 24,
    },
    bannerText: {
        color: '#fff',
        fontSize: 13,
        flex: 1,
    },
    field: {
        marginBottom: 20,
    },
    label: {
        color: '#ccc',
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 8,
    },
    hint: {
        color: '#555',
        fontSize: 11,
        marginTop: 4,
        textAlign: 'right',
    },
    input: {
        backgroundColor: '#1a1a3e',
        borderWidth: 1,
        borderColor: '#2a2a5e',
        borderRadius: 10,
        padding: 14,
        color: '#fff',
        fontSize: 15,
    },
    presetRow: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 10,
    },
    preset: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#2a2a5e',
        alignItems: 'center',
        backgroundColor: '#1a1a3e',
    },
    presetActive: {
        backgroundColor: '#9945FF',
        borderColor: '#9945FF',
    },
    presetText: {
        color: '#888',
        fontSize: 13,
        fontWeight: '600',
    },
    presetTextActive: {
        color: '#fff',
    },
    infoBox: {
        backgroundColor: '#12122e',
        borderRadius: 12,
        padding: 16,
        marginBottom: 28,
        borderLeftWidth: 3,
        borderLeftColor: '#9945FF',
    },
    infoTitle: {
        color: '#9945FF',
        fontWeight: '700',
        fontSize: 14,
        marginBottom: 8,
    },
    infoText: {
        color: '#aaa',
        fontSize: 13,
        lineHeight: 22,
    },
    infoHighlight: {
        color: '#14F195',
        fontWeight: '700',
    },
    button: {
        backgroundColor: '#9945FF',
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: 'center',
    },
    buttonDisabled: {
        opacity: 0.4,
    },
    buttonText: {
        color: '#fff',
        fontSize: 17,
        fontWeight: '700',
    },
    successCard: {
        backgroundColor: '#0d3320',
        borderRadius: 16,
        padding: 24,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#14F195',
    },
    successTitle: {
        color: '#14F195',
        fontSize: 22,
        fontWeight: 'bold',
        marginBottom: 12,
    },
    successName: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '600',
        marginBottom: 12,
    },
    successTx: {
        color: '#888',
        fontSize: 11,
        marginBottom: 24,
        width: '100%',
        textAlign: 'center',
    },
    resetButton: {
        backgroundColor: '#9945FF',
        paddingVertical: 12,
        paddingHorizontal: 32,
        borderRadius: 10,
    },
    resetButtonText: {
        color: '#fff',
        fontWeight: '700',
        fontSize: 15,
    },
})