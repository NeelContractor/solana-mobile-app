import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { ProofOfPresence } from "../target/types/proof_of_presence";
import { expect } from "chai";

describe("proof-of-presence", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace
    .ProofOfPresence as Program<ProofOfPresence>;

  const organizer = provider.wallet;
  const attendee = anchor.web3.Keypair.generate();

  const eventName = "Solana Meetup";

  let eventPda: anchor.web3.PublicKey;
  let attendancePda: anchor.web3.PublicKey;

  const lat = new anchor.BN(12345678);
  const lng = new anchor.BN(12345678);

  const radius = 500; // meters

  let startsAt: anchor.BN;
  let endsAt: anchor.BN;

  before(async () => {
    // Airdrop SOL to attendee
    const sig = await provider.connection.requestAirdrop(
      attendee.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig);

    const now = Math.floor(Date.now() / 1000);
    startsAt = new anchor.BN(now - 10);
    endsAt = new anchor.BN(now + 1000);

    // derive event PDA
    [eventPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("event"),
        organizer.publicKey.toBuffer(),
        Buffer.from(eventName),
      ],
      program.programId
    );

    [attendancePda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("attendance"),
        eventPda.toBuffer(),
        attendee.publicKey.toBuffer(),
      ],
      program.programId
    );
  });

  it("Create event", async () => {
    await program.methods
      .createEvent(
        eventName,
        lat,
        lng,
        radius,
        startsAt,
        endsAt
      )
      .accountsStrict({
        event: eventPda,
        organizer: organizer.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const event = await program.account.event.fetch(eventPda);

    expect(event.name).to.eq(eventName);
    expect(event.radiusMeters).to.eq(radius);
    expect(event.attendeeCount).to.eq(0);
  });

  it("Check in successfully", async () => {
    await program.methods
      .checkIn(lat, lng)
      .accountsStrict({
        attendee: attendee.publicKey,
        event: eventPda,
        attendance: attendancePda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([attendee])
      .rpc();

    const attendance = await program.account.attendance.fetch(attendancePda);
    const event = await program.account.event.fetch(eventPda);

    expect(attendance.isCheckedIn).to.eq(true);
    expect(event.attendeeCount).to.eq(1);
  });

  it("Prevents double check-in", async () => {
    try {
      await program.methods
        .checkIn(lat, lng)
        .accountsStrict({
          attendee: attendee.publicKey,
          event: eventPda,
          attendance: attendancePda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([attendee])
        .rpc();
  
      expect.fail("Should have failed with AlreadyCheckedIn");
    } catch (err: any) {
      const errorCode =
        err?.error?.errorCode?.code ||           // old Anchor
        err?.transactionLogs?.find((log: string) => log.includes("AlreadyCheckedIn")) || // from logs
        err?.message?.includes("AlreadyCheckedIn"); // from message
  
      expect(errorCode).to.be.ok;
    }
  });

  it("Fails if out of range", async () => {
    const newUser = anchor.web3.Keypair.generate();

    const sig = await provider.connection.requestAirdrop(
      newUser.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig);

    const [newAttendancePda] =
      anchor.web3.PublicKey.findProgramAddressSync(
        [
          Buffer.from("attendance"),
          eventPda.toBuffer(),
          newUser.publicKey.toBuffer(),
        ],
        program.programId
      );

    try {
      await program.methods
        .checkIn(new anchor.BN(99999999), new anchor.BN(99999999))
        .accountsStrict({
          attendee: newUser.publicKey,
          event: eventPda,
          attendance: newAttendancePda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([newUser])
        .rpc();

      expect.fail("Should fail out of range");
    } catch (err: any) {
      expect(err.error.errorCode.code).to.eq("OutOfRange");
    }
  });

  it("Fails if event not active", async () => {
    const futureEventName = "Future Event";

    const [futureEventPda] =
      anchor.web3.PublicKey.findProgramAddressSync(
        [
          Buffer.from("event"),
          organizer.publicKey.toBuffer(),
          Buffer.from(futureEventName),
        ],
        program.programId
      );

    const futureStart = new anchor.BN(Math.floor(Date.now() / 1000) + 5000);
    const futureEnd = new anchor.BN(Math.floor(Date.now() / 1000) + 10000);

    await program.methods
      .createEvent(
        futureEventName,
        lat,
        lng,
        radius,
        futureStart,
        futureEnd
      )
      .accountsStrict({
        event: futureEventPda,
        organizer: organizer.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const user = anchor.web3.Keypair.generate();

    const sig = await provider.connection.requestAirdrop(
      user.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig);

    const [futureAttendancePda] =
      anchor.web3.PublicKey.findProgramAddressSync(
        [
          Buffer.from("attendance"),
          futureEventPda.toBuffer(),
          user.publicKey.toBuffer(),
        ],
        program.programId
      );

    try {
      await program.methods
        .checkIn(lat, lng)
        .accountsStrict({
          attendee: user.publicKey,
          event: futureEventPda,
          attendance: futureAttendancePda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([user])
        .rpc();

      expect.fail("Should fail");
    } catch (err: any) {
      expect(err.error.errorCode.code).to.eq("EventNotActive");
    }
  });
});
