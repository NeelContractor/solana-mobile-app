use anchor_lang::prelude::*;

declare_id!("5FGBLn94L7dpNzvAG5vwBc2wqLVBkpT1kkers5om5sBv");

#[program]
pub mod proof_of_presence {
    use super::*;

    pub fn create_event(
        ctx: Context<CreateEvent>,
        name: String,
        lat: i64, // latitude * 1_000_000 (e.g. 12.345678 -> 12345678)
        lng: i64, // longitude * 1_000_000
        radius_meters: u32,
        starts_at: i64,
        ends_at: i64,
    ) -> Result<()> {
        let event = &mut ctx.accounts.event;
        event.organizer = ctx.accounts.organizer.key();
        event.name = name;
        event.lat = lat;
        event.lng = lng;
        event.radius_meters = radius_meters;
        event.starts_at = starts_at;
        event.ends_at = ends_at;
        event.attendee_count = 0;

        Ok(())
    }

    pub fn check_in(
        ctx: Context<CheckIn>,
        user_lat: i64,
        user_lng: i64,
    ) -> Result<()> {
        let event = &mut ctx.accounts.event;
        let clock = Clock::get()?;

        // Time clock
        require!(clock.unix_timestamp >= event.starts_at && clock.unix_timestamp <= event.ends_at, ErrorCode::EventNotActive);

        // Prevent double check-in
        require!(!ctx.accounts.attendance.is_checked_in, ErrorCode::AlreadyCheckedIn);

        // Distance check using scaled integer math (approximate haversine)
        let dlat = (user_lat - event.lat).abs() as u64;
        let dlng = (user_lng - event.lng).abs() as u64;
        // 1 degree ~ 111_000 meters, coords scaled by 1_000_000
        // so 1 unit = 0.111 meters
        let dist_approx = ((dlat * dlng + dlng * dlng) as f64).sqrt() * 0.111;
        require!(dist_approx <= event.radius_meters as f64, ErrorCode::OutOfRange);

        // Record attendance
        ctx.accounts.attendance.attendee = ctx.accounts.attendee.key();
        ctx.accounts.attendance.event = event.key();
        ctx.accounts.attendance.is_checked_in = true;
        ctx.accounts.attendance.checked_in_at = clock.unix_timestamp;
        event.attendee_count += 1;

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(name: String)]
pub struct CreateEvent<'info> {
    #[account(
        init,
        payer = organizer,
        space = 8 + Event::INIT_SPACE,
        seeds = [b"event", organizer.key().as_ref(), name.as_bytes()],
        bump
    )]
    pub event: Account<'info, Event>,
    #[account(mut)]
    pub organizer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CheckIn<'info> {
    #[account(mut)]
    pub attendee: Signer<'info>,
    #[account(mut)]
    pub event: Account<'info, Event>,
    #[account(
        init,
        payer = attendee,
        space = 8 + Attendance::INIT_SPACE,
        seeds = [b"attendance", event.key().as_ref(), attendee.key().as_ref()],
        bump
    )]
    pub attendance: Account<'info, Attendance>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct Event {
    pub organizer: Pubkey,
    #[max_len(64)]
    pub name: String, // max 64 chars
    pub lat: i64,
    pub lng: i64,
    pub radius_meters: u32,
    pub starts_at: i64,
    pub ends_at: i64,
    pub attendee_count: u32,
}

#[account]
#[derive(InitSpace)]
pub struct Attendance {
    pub attendee: Pubkey,
    pub event: Pubkey,
    pub is_checked_in: bool,
    pub checked_in_at: i64,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Event is not currently active")]
    EventNotActive,
    #[msg("Already checked in to this event")]
    AlreadyCheckedIn,
    #[msg("You are not within the event radius")]
    OutOfRange,
}