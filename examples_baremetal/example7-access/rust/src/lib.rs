use borsh::{BorshDeserialize, BorshSchema, BorshSerialize};
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    borsh::try_from_slice_unchecked,
    entrypoint,
    entrypoint::ProgramResult,
    msg,
    program_error::ProgramError,
    pubkey::Pubkey,
};

use std::str::from_utf8;

/// Define the type of state stored in accounts
#[derive(BorshSerialize, BorshDeserialize, Debug, Clone, BorshSchema)]
pub struct AccessStruct {
    pub word: String,
    pub last_access: u32, // empty
    pub valid_access_counter: u32,
    pub invalid_access_counter: u32,
}

// Declare and export the program's entrypoint
entrypoint!(process_instruction);

// Program entrypoint's implementation
pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    msg!("[lib] Access example entrypoint");

    // Iterating accounts is safer then indexing
    let accounts_iter = &mut accounts.iter();

    // Get the account to say hello to
    let access_account = next_account_info(accounts_iter)?;

    msg!(
        "[lib] Provided access account key: {:?}",
        access_account.key
    );

    // The account must be owned by the program in order to modify its data
    if access_account.owner != program_id {
        msg!("This program doesn't own {:?}", access_account.key);
        return Err(ProgramError::IncorrectProgramId);
    } else {
        msg!("Program owns account provided");
    }

    // Create a struct that's easy to interact with programatcially from access account data
    let mut access_struct =
        try_from_slice_unchecked::<AccessStruct>(&access_account.data.borrow())?;

    let mut word: String = "".to_string();
    let mut access_granted: bool = false;

    // something actually passed
    if instruction_data.len() > 0 {
        // Get the account that manages access account
        let caller = next_account_info(accounts_iter)?;

        // Ensure provided public key is signed
        if caller.is_signer {
            // Get the size of the seed
            let (seed_length, rest) =
                instruction_data
                    .split_first()
                    .ok_or(ProgramError::BorshIoError(
                        "Invalid parameters passed".to_string(),
                    ))?;

            // Get seed from up to the key size as a string
            let seed = from_utf8(rest.get(..*seed_length as usize).unwrap())
                .unwrap()
                .to_string();

            // Derive the PDA from: caller_account, seed, program ID
            let derived_pda = Pubkey::create_with_seed(caller.key, &seed, &program_id).unwrap();

            // Compare to see if derived account is the same as the provided access account key
            if derived_pda == *access_account.key {
                access_granted = true;

                // Get the rest of the word
                word = from_utf8(rest.get(*seed_length as usize + 1..).unwrap())
                    .unwrap()
                    .to_string();
            }
        }

        // Increment based on the caller
        if !access_granted {
            access_struct.invalid_access_counter += 1;
            msg!("Illegal attempt to write to the word");
        } else {
            access_struct.valid_access_counter += 1;

            if word.len() > 0 {
                access_struct.word = word;
                msg!("Legal attempt to write to the word");
            }
        }
    } else {
        access_struct.valid_access_counter += 1;
    }

    msg!("Access struct:\n\tword: {:?}\n\tvalid_access_counter: {:?}\n\tinvalid_access_counter: {:?}\n", 
	access_struct.word, access_struct.valid_access_counter, access_struct.invalid_access_counter);

    // Serialise the local struct and store it back into the account
    access_struct.serialize(&mut &mut access_account.data.borrow_mut()[..])?;

    msg!("Access struct serialised back into the account");

    Ok(())
}
