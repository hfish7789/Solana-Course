/**
 * Counter
 */
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  sendAndConfirmTransaction,
  Transaction,
} from "@solana/web3.js";
import path from "path";
import * as borsh from "borsh";
import fsExtra from "fs-extra";
import fs from "fs";

import {
  getPayer,
  establishConnection,
  checkBinaryExists,
  getBalance,
  establishEnoughSol,
  checkProgram,
  getUserInput,
  loadKeypairsBatch,
  topUpAccounts,
} from "../../../utils/utils";

// directory with binary and keypair
const PROGRAM_PATH = path.resolve(__dirname, "../../target/deploy/");

// Path to program shared object file which should be deployed on chain.
const PROGRAM_SO_PATH = path.join(PROGRAM_PATH, "access.so");

// Path to the keypair of the deployed program (This file is created when running `solana program deploy)
const PROGRAM_KEYPAIR_PATH = path.join(PROGRAM_PATH, "access-keypair.json");

const accs_loc: string = "./examples_baremetal/example7-access/client/accs/";

async function main() {
  console.log("Let's increment an account!");

  let payer: Keypair = await getPayer();

  // Establish connection to the cluster
  let connection: Connection = await establishConnection();

  await establishEnoughSol(connection, payer);

  // balance after top-up
  let [startBalanceSol, startBalanceLamport] = await getBalance(
    connection,
    payer
  );

  // Check if binary exists
  let programID = await checkBinaryExists(PROGRAM_KEYPAIR_PATH);

  // Check program deployed
  if (await checkProgram(connection, programID)) {
    while (true) {
      let paid = await Options(programID, connection, payer);

      // Check if trhee accounts are up
      if (paid == true) {
        // Print fees used up
        let [endBalanceSol, endBalanceLamport] = await getBalance(
          connection,
          payer
        );

        console.log(
          `\nIt cost:\n\t${startBalanceSol - endBalanceSol} SOL\n\t${
            startBalanceLamport - endBalanceLamport
          } Lamports\nto perform the call`
        );
      }
    }
  } else {
    console.log(`\nProgram ${PROGRAM_SO_PATH} not deployed!\n`);
  }
}

export async function Options(
  programID: PublicKey,
  connection: Connection,
  payer: Keypair
) {
  const option = await getUserInput(
    // "Do you want to create PDA or write to PDA (c/w)?"
    "\nPick option:\n\tCreate an account:\t(1)\n\tCall an account:\t(2)\n\tWrite to an account:\t(3)\n\tRead an account:\t(4)\n\tDisplay made accounts:\t(5)\n\tClear stored accounts:\t(6)"
  );

  if (option == "1") {
    await createAccount(programID, connection, payer);
  } else if (option == "2") {
    await callAccount(programID, connection, payer);
  } else if (option == "3") {
    await writeAccount(programID, connection, payer);
  } else if (option == "4") {
    await readAccount(programID, connection);
    return false;
  } else if (option == "5") {
    await logGeneratedAccounts();
    return false;
  } else {
    await clearLocalAccounts();
    return false;
  }

  const end = await getUserInput(
    "\nEnter anything but X to continue this example."
  );

  if (end.toUpperCase() == "X") {
    process.exit();
  }

  return true;
}

export async function logGeneratedAccounts() {
  console.log(
    `\nPDA address\t\t\t\t\tManager address\t\t\t\t\tProgram address\t\t\t\t\tseed`
  );

  await fs.readdirSync(accs_loc).forEach(async (file: string) => {
    let file_obj = JSON.parse(
      JSON.parse(await fs.readFileSync(`${accs_loc}/${file}`, "utf8"))
    );

    console.log(
      `${file_obj.pda_address}\t${file_obj.manager_address}\t${file_obj.program_address}\t${file_obj.seed}}`
    );
  });
}

export async function clearLocalAccounts() {
  let account_dets_loc = "./examples_baremetal/example7-access/client/accs";
  fsExtra.emptyDirSync(account_dets_loc);
}

export async function saveAccFile(
  loc: string = "",
  PDA_address: string = "",
  program_address: string = "",
  manager_address: string = "",
  seed: string = ""
) {
  let json_acc = JSON.stringify(
    `{"pda_address":"${PDA_address}", "program_address":"${program_address}", "manager_address":"${manager_address}", "seed":"${seed}"}`
  );

  await fs.writeFileSync(
    `${loc}${PDA_address.slice(0, 20)}.json`,
    json_acc,
    "utf8"
  );
}

export async function readAccFile(
  loc: string = "./examples_baremetal/example6-access/client/accs/myjsonfile2.json"
): Promise<any> {
  // console.log("\n\nreasfding json file\n\n");
  let stringified_json = await fs.readFileSync(loc, "utf8");
  return JSON.parse(JSON.parse(stringified_json));
}

export async function createAccount(
  programId: PublicKey, // program that will interact with it
  connection: Connection,
  payer: Keypair // payer of the account being deployed
) {
  const AccessSchema = new Map([
    [
      AccessAccount,
      {
        kind: "struct",
        fields: [
          ["word", "string"],
          ["lastAccess", "u64"],
          ["validAccessCounter", "u32"],
          ["invalidAccessCounter", "u32"],
        ],
      },
    ],
  ]);

  console.log("Program ID account: ", programId.toBase58());

  // Get account that will pay for deployment of the account
  const manager_account = await getAccount(
    programId,
    connection,
    payer,
    "account manager/payer"
  );

  // word limit
  const word_size = 40;

  // size of all the following accounts
  const ACCESS_ACCOUNT_SIZE =
    borsh.serialize(AccessSchema, new AccessAccount()).length + word_size;

  const lamports = await connection.getMinimumBalanceForRentExemption(
    ACCESS_ACCOUNT_SIZE
  );

  const seed = await getUserInput("\nEnter seed for the PDA");

  let PDAPubKey = await PublicKey.createWithSeed(
    manager_account.publicKey,
    seed,
    programId // derived from keypair json file in /dist/program
  );

  const transaction = new Transaction().add(
    SystemProgram.createAccountWithSeed({
      fromPubkey: manager_account.publicKey,
      basePubkey: manager_account.publicKey,
      seed: seed,
      newAccountPubkey: PDAPubKey,
      lamports: lamports,
      space: ACCESS_ACCOUNT_SIZE,
      programId: programId,
    })
  );

  await sendAndConfirmTransaction(connection, transaction, [manager_account]);

  console.log(
    `Creating PDA ${PDAPubKey.toBase58()} that ${manager_account.publicKey.toString()} will manage.`
  );

  saveAccFile(
    accs_loc,
    PDAPubKey.toString(),
    manager_account.publicKey.toString(),
    seed
  );
}

export async function getAccount(
  programId: PublicKey,
  connection: Connection,
  payer: Keypair,
  account_purpose: string
): Promise<Keypair> {
  let keys = await loadKeypairsBatch("./utils/keypair");

  keys.push(payer);

  // top up needed fro "call"
  await topUpAccounts(connection, keys);

  console.log(`\nSelect keypair for ${account_purpose}:\n`);
  for (let k = 0; k < keys.length; k++) {
    console.log(`${keys[k].publicKey.toString()}\t(${k + 1})`);
  }

  let calling_account_input = parseInt(await getUserInput(""));

  if (isNaN(calling_account_input)) {
    calling_account_input = keys.length;
  } else if (calling_account_input > 3) {
    calling_account_input = 3;
  }

  let calling_account = keys[calling_account_input - 1];

  console.log(
    `Selected caller account: ${calling_account.publicKey.toString()}`
  );

  return calling_account;
}

export async function callAccount(
  programId: PublicKey,
  connection: Connection,
  payer: Keypair
) {
  // Get account that will call
  const calling_account = await getAccount(
    programId,
    connection,
    payer,
    "calling"
  );

  // generate instruction for call only ie no instruction data
  var instruction_set = Buffer.alloc(0, 0);

  const acc = await getUserInput("Paste the access account public key.");
  let access_account = new PublicKey(acc);

  // assembly of transd
  const transaction = new TransactionInstruction({
    programId: programId,
    keys: [
      {
        pubkey: access_account,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: calling_account.publicKey,
        isSigner: true,
        isWritable: false,
      },
    ],
    data: instruction_set,
  });

  // uses global variables
  await sendAndConfirmTransaction(
    connection,
    new Transaction().add(transaction),
    [calling_account]
  );
}

export async function writeAccount(
  programId: PublicKey,
  connection: Connection,
  payer: Keypair
) {
  // Get account that will call
  const calling_account = await getAccount(
    programId,
    connection,
    payer,
    "calling"
  );

  const word = await getUserInput("Type string to write to the account.");
  const seed = await getUserInput("Type seed used to generate this account.");
  const acc = await getUserInput("Paste the access account public key.");

  let access_account = new PublicKey(acc);

  console.log("access_account: ", access_account.toString());

  var instruction_set = Buffer.concat([
    Buffer.alloc(1, seed.length), // seed size
    Buffer.from(seed), // seed
    Buffer.alloc(1, word.length), // length of the word to write/store
    Buffer.from(word), // bytes of user specified word
  ]);

  // assembly of instruction
  const transaction = new TransactionInstruction({
    programId: programId,
    keys: [
      { pubkey: access_account, isSigner: false, isWritable: true },
      {
        pubkey: calling_account.publicKey,
        isSigner: true,
        isWritable: false,
      },
    ],
    data: instruction_set,
  });

  // uses global variables
  await sendAndConfirmTransaction(
    connection,
    new Transaction().add(transaction),
    [calling_account]
  );
}

// based on schema
export async function readAccount(
  accountID: PublicKey,
  connection: Connection
) {
  // Program is deployed here
  // generate PDA owned by keypair 1
}

/**
 * The state of a greeting account managed by the hello world program
 */
class AccessAccount {
  word = "";
  lastAccess = 0;
  validAccessCounter = 0;
  invalidAccessCounter = 0;

  constructor(
    fields:
      | {
          lastAccess: number;
          word: string;
          validAccessCounter: number;
          invalidAccessCounter: number;
        }
      | undefined = undefined
  ) {
    if (fields) {
      this.lastAccess = fields.lastAccess;
      this.validAccessCounter = fields.validAccessCounter;
      this.invalidAccessCounter = fields.invalidAccessCounter;
      this.word = fields.word;
    }
  }
}

main().then(
  () => process.exit(),
  (err) => {
    console.error(err);
    process.exit(-1);
  }
);
