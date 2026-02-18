'use client'

import { Cluster, LAMPORTS_PER_SOL, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from '@solana/web3.js'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { useConnection } from '../utils/ConnectionProvider'
import { useCluster } from '../components/cluster/cluster-data-access'
import * as anchor from "@coral-xyz/anchor"

import IDL from '../../proof-of-presence/target/idl/proof_of_presence.json'
import type { ProofOfPresence } from '../../proof-of-presence/target/types/proof_of_presence'

const PROGRAM_ID = new PublicKey("5FGBLn94L7dpNzvAG5vwBc2wqLVBkpT1kkers5om5sBv");

interface CreateEventArgs {
    organizerPubkey: PublicKey,
    name: string,
    lat: number, // real latitude e.g. 12.345678
    lng: number, // real longitude e.g. 12.345678
    radiusMeters: number,
    startsAt: Date,
    endsAt: Date,
}

interface CheckInArgs {
    attendeePubkey: PublicKey,
    organizerPubkey: PublicKey,
    eventName: string,
    userLat: number, // real latitude
    userLng: number // real longitude
}

// Helper: convert real coords to scaled integer
const toScaled = (coord: number) => new anchor.BN(Math.round(coord * 1_000_000))

// Helper: derive event PDA
const getEventPDA = (organizerPubkey: PublicKey, eventName: string) => PublicKey.findProgramAddressSync(
    [Buffer.from('event'), organizerPubkey.toBuffer(), Buffer.from(eventName)],
    PROGRAM_ID
);

// Helper: derive event PDA
const getAttendancePDA = (eventPDA: PublicKey, attendeePubkey: PublicKey) => PublicKey.findProgramAddressSync(
    [Buffer.from('attendance'), eventPDA.toBuffer(), attendeePubkey.toBuffer()],
    PROGRAM_ID
)

export function usePOPProgram() {
    const { connection } = useConnection()
    const provider = useMemo(
        () => new anchor.AnchorProvider(
            connection,
            // Dummy wallet — signing is handled by Mobile Wallet Adapter
            {
                publicKey: PublicKey.default,
                signTransaction: async (tx) => tx,
                signAllTransactions: async (txs) => txs,
            },
            { commitment: "confirmed" }
        ),
        [connection]
    )
    const program = useMemo(() => new anchor.Program<ProofOfPresence>(IDL as ProofOfPresence, PROGRAM_ID, provider), [provider])

    const allEvents = useQuery({
        queryKey: ['pop', 'events', "all"],
        queryFn: () => program.account.event.all(),
    })

    const allAttendance = useQuery({
        queryKey: ['pop', 'attendance', 'all'],
        queryFn: () => program.account.attendance.all(),
    })

    const getProgramAccount = useQuery({
        queryKey: ['pop', 'get-program-account'],
        queryFn: () => connection.getParsedAccountInfo(PROGRAM_ID),
    })

    const fetchEvent = async (organizerPubkey: PublicKey, eventName: string) => {
        const [eventPDA] = getEventPDA(organizerPubkey, eventName)
        return program.account.event.fetch(eventPDA)
    }

    const fetchAttendance = async (organizerPubkey: PublicKey, eventName: string, attendeePubkey: PublicKey) => {
        const [eventPDA] = getEventPDA(organizerPubkey, eventName)
        const [attendancePDA] = getAttendancePDA(eventPDA, attendeePubkey)
        try {
            return await program.account.attendance.fetch(attendancePDA)
        } catch {
            return null // not checked in yet
        }
    }
    // ── Create Event (organizer) ───────────────────────────────────────────────
    // NOTE: Returns the instruction — pass to Mobile Wallet Adapter for signing
    const buildCreateEventIx = async ({
        organizerPubkey,
        name,
        lat,
        lng,
        radiusMeters,
        startsAt,
        endsAt,
    }: CreateEventArgs) => {
        const [eventPDA] = getEventPDA(organizerPubkey, name)

        const ix = await program.methods
        .createEvent(
            name,
            toScaled(lat),
            toScaled(lng),
            radiusMeters,
            new anchor.BN(Math.floor(startsAt.getTime() / 1000)),
            new anchor.BN(Math.floor(endsAt.getTime() / 1000))
        )
        .accountsStrict({
            event: eventPDA,
            organizer: organizerPubkey,
            systemProgram: SystemProgram.programId,
        })
        .instruction()

        return { ix, eventPDA }
    }

    // ── Check In (attendee) ────────────────────────────────────────────────────
    // NOTE: Returns the instruction — pass to Mobile Wallet Adapter for signing
    const buildCheckInIx = async ({
        attendeePubkey,
        organizerPubkey,
        eventName,
        userLat,
        userLng,
    }: CheckInArgs) => {
        const [eventPDA] = getEventPDA(organizerPubkey, eventName)
        const [attendancePDA] = getAttendancePDA(eventPDA, attendeePubkey)

        const ix = await program.methods
        .checkIn(toScaled(userLat), toScaled(userLng))
        .accountsStrict({
            event: eventPDA,
            attendance: attendancePDA,
            attendee: attendeePubkey,
            systemProgram: SystemProgram.programId,
        })
        .instruction()

        return { ix, attendancePDA, eventPDA }
    }

    // ── useMutation wrappers (for use with MWA transact()) ────────────────────
    // These return the built instruction — your screen handles MWA signing.
    // See CheckInScreen.tsx for usage pattern.

    const createEventMutation = useMutation({
        mutationKey: ['pop', 'create-event'],
        mutationFn: buildCreateEventIx,
        onError: (error) => {
            console.error('Create event error:', error)
        },
    })

    const checkInMutation = useMutation({
        mutationKey: ['pop', 'check-in'],
        mutationFn: buildCheckInIx,
        onSuccess: () => {
            allAttendance.refetch()
            allEvents.refetch()
        },
        onError: (error) => {
            console.error('Check-in error:', error)
        },
    })

    return {
        // Program
        program,
        programId: PROGRAM_ID,

        // Queries
        allEvents,
        allAttendance,
        getProgramAccount,

        // Fetch helpers
        fetchEvent,
        fetchAttendance,

        // Instruction builders (use inside transact() in your screens)
        buildCreateEventIx,
        buildCheckInIx,

        // Mutations (optional — wrap buildXxx + MWA in one place if preferred)
        createEventMutation,
        checkInMutation,
    }
}