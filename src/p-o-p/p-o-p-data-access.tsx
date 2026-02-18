import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useConnection } from "../utils/ConnectionProvider";
import { useMobileWallet } from "../utils/useMobileWallet";
import * as anchor from "@coral-xyz/anchor";

import IDL from "../../proof-of-presence/target/idl/proof_of_presence.json";
import type { ProofOfPresence } from "../../proof-of-presence/target/types/proof_of_presence";

// ── Program ID ────────────────────────────────────────────────────────────────
const PROGRAM_ID = new PublicKey("5FGBLn94L7dpNzvAG5vwBc2wqLVBkpT1kkers5om5sBv");

// ── Types ─────────────────────────────────────────────────────────────────────
interface CreateEventArgs {
  organizerPubkey: PublicKey;
  name: string;
  lat: number;
  lng: number;
  radiusMeters: number;
  startsAt: Date;
  endsAt: Date;
}

interface CheckInArgs {
  attendeePubkey: PublicKey;
  organizerPubkey: PublicKey;
  eventName: string;
  userLat: number;
  userLng: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const toScaled = (coord: number) => new anchor.BN(Math.round(coord * 1_000_000));

const getEventPDA = (organizerPubkey: PublicKey, eventName: string) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("event"), organizerPubkey.toBuffer(), Buffer.from(eventName)],
    PROGRAM_ID
  );

const getAttendancePDA = (eventPDA: PublicKey, attendeePubkey: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("attendance"), eventPDA.toBuffer(), attendeePubkey.toBuffer()],
    PROGRAM_ID
  );

// ── Main Hook ─────────────────────────────────────────────────────────────────
export function usePOPProgram() {
  const { connection } = useConnection();
  const wallet = useMobileWallet(); // ✅ same as useTransferSol
  const client = useQueryClient();  // ✅ same as useTransferSol

  // Read-only provider — signing done by MWA via useMobileWallet
  const provider = useMemo(
    () =>
      new anchor.AnchorProvider(
        connection,
        {
          publicKey: PublicKey.default,
          signTransaction: async (tx) => tx,
          signAllTransactions: async (txs) => txs,
        },
        { commitment: "confirmed" }
      ),
    [connection]
  );

  const program = useMemo(
    () => new anchor.Program<ProofOfPresence>(IDL as ProofOfPresence, provider),
    [provider]
  );

  // ── Queries ────────────────────────────────────────────────────────────────
  const allEvents = useQuery({
    queryKey: ["pop", "events", "all", { endpoint: connection.rpcEndpoint }],
    queryFn: () => program.account.event.all(),
  });

  const allAttendance = useQuery({
    queryKey: ["pop", "attendance", "all", { endpoint: connection.rpcEndpoint }],
    queryFn: () => program.account.attendance.all(),
  });

  // ── Fetch helpers ──────────────────────────────────────────────────────────
  const fetchEvent = async (organizerPubkey: PublicKey, eventName: string) => {
    const [eventPDA] = getEventPDA(organizerPubkey, eventName);
    return program.account.event.fetch(eventPDA);
  };

  const fetchAttendance = async (
    organizerPubkey: PublicKey,
    eventName: string,
    attendeePubkey: PublicKey
  ) => {
    const [eventPDA] = getEventPDA(organizerPubkey, eventName);
    const [attendancePDA] = getAttendancePDA(eventPDA, attendeePubkey);
    try {
      return await program.account.attendance.fetch(attendancePDA);
    } catch {
      return null;
    }
  };

  // ── Create Event ───────────────────────────────────────────────────────────
  // ✅ Mirrors useTransferSol pattern exactly:
  //    build tx → wallet.signAndSendTransaction → confirmTransaction
  const createEvent = useMutation({
    mutationKey: ["pop", "create-event", { endpoint: connection.rpcEndpoint }],
    mutationFn: async ({
      organizerPubkey,
      name,
      lat,
      lng,
      radiusMeters,
      startsAt,
      endsAt,
    }: CreateEventArgs) => {
      const [eventPDA] = getEventPDA(organizerPubkey, name);

      // 1. Build instruction
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
        .instruction();

      // 2. Build versioned transaction (same as createTransaction() in template)
      const {
        context: { slot: minContextSlot },
        value: latestBlockhash,
      } = await connection.getLatestBlockhashAndContext();

      const tx = new Transaction({
        recentBlockhash: latestBlockhash.blockhash,
        feePayer: organizerPubkey,
      }).add(ix);

      // 3. Sign and send via MWA — same as useTransferSol
      const signature = await wallet.signAndSendTransaction(tx, minContextSlot);

      // 4. Confirm
      await connection.confirmTransaction(
        { signature, ...latestBlockhash },
        "confirmed"
      );

      return { signature, eventPDA };
    },
    onSuccess: ({ signature }) => {
      console.log("Event created:", signature);
      return Promise.all([
        client.invalidateQueries({ queryKey: ["pop", "events", "all"] }),
      ]);
    },
    onError: (error) => {
      console.error("Create event error:", error);
    },
  });

  // ── Check In ───────────────────────────────────────────────────────────────
  const checkIn = useMutation({
    mutationKey: ["pop", "check-in", { endpoint: connection.rpcEndpoint }],
    mutationFn: async ({
      attendeePubkey,
      organizerPubkey,
      eventName,
      userLat,
      userLng,
    }: CheckInArgs) => {
      const [eventPDA] = getEventPDA(organizerPubkey, eventName);
      const [attendancePDA] = getAttendancePDA(eventPDA, attendeePubkey);

      // 1. Build instruction
      const ix = await program.methods
        .checkIn(toScaled(userLat), toScaled(userLng))
        .accountsStrict({
          event: eventPDA,
          attendance: attendancePDA,
          attendee: attendeePubkey,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      // 2. Build transaction
      const {
        context: { slot: minContextSlot },
        value: latestBlockhash,
      } = await connection.getLatestBlockhashAndContext();

      const tx = new Transaction({
        recentBlockhash: latestBlockhash.blockhash,
        feePayer: attendeePubkey,
      }).add(ix);

      // 3. Sign and send via MWA
      const signature = await wallet.signAndSendTransaction(tx, minContextSlot);

      // 4. Confirm
      await connection.confirmTransaction(
        { signature, ...latestBlockhash },
        "confirmed"
      );

      return { signature, attendancePDA, eventPDA };
    },
    onSuccess: ({ signature }) => {
      console.log("Checked in:", signature);
      return Promise.all([
        client.invalidateQueries({ queryKey: ["pop", "attendance", "all"] }),
        client.invalidateQueries({ queryKey: ["pop", "events", "all"] }),
      ]);
    },
    onError: (error) => {
      console.error("Check-in error:", error);
    },
  });

  return {
    program,
    programId: PROGRAM_ID,
    allEvents,
    allAttendance,
    fetchEvent,
    fetchAttendance,
    createEvent,   // use createEvent.mutateAsync({...}) in screens
    checkIn,       // use checkIn.mutateAsync({...}) in screens
  };
}