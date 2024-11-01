import {
    Connection,
    PublicKey,
    Keypair,
    StakeProgram,
    LAMPORTS_PER_SOL,
    sendAndConfirmTransaction,
    Transaction,
} from '@solana/web3.js';
import {
    MarginfiClient,
    getConfig
} from "@mrgnlabs/marginfi-client-v2";
import { NodeWallet } from "@mrgnlabs/mrgn-common";

require('dotenv').config();

class UnstakeAndLendManager {
    private connection: Connection;
    private wallet: NodeWallet;
    private marginfiClient: MarginfiClient | null = null;

    constructor(
        connection: Connection,
        wallet: NodeWallet
    ) {
        this.connection = connection;
        this.wallet = wallet;
    }

    async initialize() {
        // Initialize marginfi client
        const config = getConfig("production");
        this.marginfiClient = await MarginfiClient.fetch(
            config,
            this.wallet,
            this.connection
        );
    }

    async deactivateStake(stakeAccountPubkey: PublicKey): Promise<string> {
        console.log("Deactivating stake account...");

        const deactivateTransaction = StakeProgram.deactivate({
            stakePubkey: stakeAccountPubkey,
            authorizedPubkey: this.wallet.publicKey,
        });

        const signature = await sendAndConfirmTransaction(
            this.connection,
            deactivateTransaction,
            [this.wallet.payer],
            { commitment: 'confirmed' }
        );

        console.log("Stake deactivation initiated. Signature:", signature);
        return signature;
    }

    async checkStakeStatus(stakeAccountPubkey: PublicKey): Promise<string> {
        const stakeAccount = await this.connection.getStakeActivation(stakeAccountPubkey);
        return stakeAccount.state;
    }

    async withdrawDeactivatedStake(
        stakeAccountPubkey: PublicKey
    ): Promise<{ signature: string; amount: number }> {
        console.log("Withdrawing deactivated stake...");

        // Get stake account balance
        const stakeBalance = await this.connection.getBalance(stakeAccountPubkey);

        const withdrawTransaction = StakeProgram.withdraw({
            stakePubkey: stakeAccountPubkey,
            authorizedPubkey: this.wallet.publicKey,
            toPubkey: this.wallet.publicKey,
            lamports: stakeBalance, // Withdraw entire balance
        });

        const signature = await sendAndConfirmTransaction(
            this.connection,
            withdrawTransaction,
            [this.wallet.payer],
            { commitment: 'confirmed' }
        );

        console.log("Stake withdrawn. Signature:", signature);
        return {
            signature,
            amount: stakeBalance / LAMPORTS_PER_SOL
        };
    }

    async lendToMarginfi(amountSol: number): Promise<string> {
        if (!this.marginfiClient) {
            throw new Error("MarginFi client not initialized");
        }

        console.log(`Lending ${amountSol} SOL to MarginFi...`);

        // Get the SOL bank
        const solBank = this.marginfiClient.getBankByTokenSymbol("SOL");
        if (!solBank) {
            throw new Error("SOL bank not found");
        }

        // Get or create marginfi account
        let marginfiAccount = (
            await this.marginfiClient.getMarginfiAccountsForAuthority(this.wallet.publicKey)
        )[0];

        if (!marginfiAccount) {
            console.log("Creating new MarginFi account...");
            marginfiAccount = await this.marginfiClient.createMarginfiAccount();
        }

        // Deposit SOL into marginfi
        const signature = await marginfiAccount.deposit(
            amountSol,
            solBank.address,
        );

        console.log("SOL deposited to MarginFi. Signature:", signature);
        return signature;
    }
}

async function main() {
    try {
        // Initialize connection and wallet
        const connection = new Connection(process.env.RPC_ENDPOINT!, "confirmed");
        const wallet = NodeWallet.local();

        // Initialize manager
        const manager = new UnstakeAndLendManager(connection, wallet);
        await manager.initialize();

        // Your stake account public key
        const stakeAccountPubkey = new PublicKey(process.env.STAKE_ACCOUNT!);

        // 1. Deactivate stake
        await manager.deactivateStake(stakeAccountPubkey);

        // 2. Wait for deactivation (in production, you'd want to poll this)
        console.log("Waiting for stake to deactivate...");
        let stakeStatus: string;
        do {
            stakeStatus = await manager.checkStakeStatus(stakeAccountPubkey);
            if (stakeStatus !== "inactive") {
                console.log("Current stake status:", stakeStatus);
                await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
            }
        } while (stakeStatus !== "inactive");

        // 3. Withdraw deactivated stake
        const { amount } = await manager.withdrawDeactivatedStake(stakeAccountPubkey);

        // 4. Lend withdrawn SOL to marginfi
        await manager.lendToMarginfi(amount);

        console.log("Successfully unstaked and lent SOL to MarginFi!");
    } catch (error) {
        console.error("Error in unstake and lend process:", error);
        throw error;
    }
}

// Environment variables needed:
// RPC_ENDPOINT - Your Solana RPC endpoint
// STAKE_ACCOUNT - Public key of your stake account

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });