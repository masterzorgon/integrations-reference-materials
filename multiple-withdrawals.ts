import { Connection, PublicKey } from "@solana/web3.js";
import {
    MarginfiClient,
    getConfig
} from "@mrgnlabs/marginfi-client-v2";
import { NodeWallet } from "@mrgnlabs/mrgn-common";

// Configure the tokens to withdraw - example banks
const WITHDRAWALS = [
    { symbol: "SOL", amount: 1 },    // Withdraw 1 SOL
    { symbol: "USDC", amount: 100 }, // Withdraw 100 USDC
    { symbol: "JitoSOL", amount: 0.5 } // Withdraw 0.5 JitoSOL
];

async function withdrawFromBanks() {
    try {
        // Initialize connection and wallet
        const connection = new Connection(process.env.RPC_ENDPOINT!, "confirmed");
        const wallet = NodeWallet.local(); // Uses local keypair

        // Initialize marginfi client
        const config = getConfig("production");
        const client = await MarginfiClient.fetch(config, wallet, connection);

        // Fetch user's marginfi account
        const marginfiAccount = (await client.getMarginfiAccountsForAuthority(wallet.publicKey))[0];
        if (!marginfiAccount) {
            throw new Error("No marginfi account found for wallet");
        }

        console.log("Processing withdrawals...");

        // Process each withdrawal
        for (const { symbol, amount } of WITHDRAWALS) {
            try {
                // Get the bank for the token
                const bank = client.getBankByTokenSymbol(symbol);
                if (!bank) {
                    console.error(`Bank not found for token ${symbol}`);
                    continue;
                }

                // Check current deposit balance
                const balance = marginfiAccount.balances
                    .find(b => b.active && b.bankPk.equals(bank.address));

                if (!balance) {
                    console.log(`No active deposit found in ${symbol} bank`);
                    continue;
                }

                const currentBalance = balance.computeQuantityUi(bank).assets.toNumber();
                if (currentBalance < amount) {
                    console.error(`Insufficient balance for ${symbol}. Available: ${currentBalance}, Requested: ${amount}`);
                    continue;
                }

                // Perform withdrawal
                console.log(`Withdrawing ${amount} ${symbol}...`);
                const sig = await marginfiAccount.withdraw(
                    amount,
                    bank.address,

                );

                console.log(`Successfully withdrew ${amount} ${symbol}`);
                console.log(`Transaction signature: ${sig}`);
            } catch (error) {
                console.error(`Error withdrawing ${symbol}:`, error);
            }
        }

        // Reload account to get updated balances
        await marginfiAccount.reload();

        // Print final balances
        console.log("\nFinal balances:");
        marginfiAccount.balances
            .filter(b => b.active)
            .forEach(b => {
                const bank = client.getBankByPk(b.bankPk);
                if (bank) {
                    const balance = b.computeQuantityUi(bank).assets.toNumber();
                    console.log(`${bank.tokenSymbol}: ${balance}`);
                }
            });

    } catch (error) {
        console.error("Error in withdrawal process:", error);
        throw error;
    }
}

// Run the withdrawal script
async function main() {
    console.log("Starting withdrawals from marginfi banks...");
    try {
        await withdrawFromBanks();
        console.log("Withdrawals completed successfully");
    } catch (error) {
        console.error("Failed to complete withdrawals:", error);
        process.exit(1);
    }
}

main();