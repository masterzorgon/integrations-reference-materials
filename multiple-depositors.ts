import { PublicKey, Connection } from "@solana/web3.js";
import { MarginfiAccountWrapper, getConfig, MarginfiClient } from "@mrgnlabs/marginfi-client-v2";
import { chunkedGetRawMultipleAccountInfos, chunks, NodeWallet } from "@mrgnlabs/mrgn-common";
import fs from "fs";

// Load environment variables from .env file
require('dotenv').config();

// RPC endpoint for Solana connection - must be defined in .env file
const RPC_ENDPOINT = process.env.RPC_ENDPOINT as string

// Define which token's depositors we want to fetch
const BANK_TOKEN = "SOL";
// Alternative: fetch by mint address instead of symbol
// const BANK_TOKEN_MINT = "So11111111111111111111111111111111111111112";

// Interface defining the structure for depositor data
interface BankDepositor {
    wallet: string;      // Wallet address of the depositor
    userAccount: string; // MarginFi account address
    amount: number;      // Amount deposited in the bank
}

async function main() {
    // Initialize core connections and clients
    const connection = new Connection(RPC_ENDPOINT, "confirmed");
    const wallet = NodeWallet.local();  // Create wallet from local keypair
    const config = getConfig("production");  // Get production environment config
    const client = await MarginfiClient.fetch(config, wallet, connection);

    // Get the bank we want to analyze by token symbol
    const targetBank = client.getBankByTokenSymbol(BANK_TOKEN);
    // Alternative: get bank by mint address
    // const targetBank = client.getBankByMint(BANK_TOKEN_MINT);
    if (!targetBank) {
        throw new Error(`Bank ${BANK_TOKEN} not found`);
    }

    // Fetch all marginfi account addresses on-chain
    console.log(`Fetching all marginfi accounts...`)
    const marginfiAccountAddresses = await client.getAllMarginfiAccountAddresses();
    console.log(`Found ${marginfiAccountAddresses.length} marginfi accounts`);

    // Split addresses into manageable chunks to avoid memory issues
    // Processing 25,000 accounts at a time
    const addressBatches = chunks(marginfiAccountAddresses, 25_000);

    // Prepare CSV file for output
    // Filename includes token and timestamp for uniqueness
    const depositorFileName = `./marginfi_depositors_${BANK_TOKEN}_${Date.now()}.csv`;
    fs.writeFileSync(depositorFileName, "wallet,user_account,amount\n");

    // Process each batch of addresses
    for (let i = 0; i < addressBatches.length; i++) {
        const addressBatch = addressBatches[i];
        console.log(`Processing batch ${i + 1}/${addressBatches.length} of ${addressBatch.length} addresses`);

        // Fetch account data in chunks to avoid rate limiting
        // Returns a map of address -> account info
        const [_, accountInfoMap] = await chunkedGetRawMultipleAccountInfos(
            client.provider.connection,
            addressBatch.map((pk) => pk.toBase58())
        );

        // Process each account in the current batch
        let depositors: BankDepositor[] = [];
        for (const [address, accountInfo] of accountInfoMap) {
            // Parse raw account data into MarginfiAccountWrapper
            const marginfiAccount = MarginfiAccountWrapper.fromAccountDataRaw(
                new PublicKey(address), 
                client, 
                accountInfo.data, 
                client.program.idl
            );

            // Find any active deposits in the target bank
            // Only includes accounts with positive asset shares
            const depositAmount = marginfiAccount.balances
                .find((b) => 
                    b.active && 
                    b.bankPk.equals(targetBank.address) && 
                    b.assetShares.gt(0)
                )
                ?.computeQuantityUi(targetBank).assets;

            // If deposit found, add to our list
            if (depositAmount) {
                depositors.push({
                    wallet: marginfiAccount.authority.toString(),
                    userAccount: marginfiAccount.address.toString(),
                    amount: depositAmount.toNumber(),
                });
            }
        }

        // Convert depositor data to CSV format and append to file
        const csvContent = depositors.map(depositor => 
            `${depositor.wallet},${depositor.userAccount},${depositor.amount}`
        ).join('\n');
        fs.appendFileSync(depositorFileName, csvContent);
    }
}

main();