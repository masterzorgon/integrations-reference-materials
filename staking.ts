import {
    Connection,
    PublicKey,
    Keypair,
    StakeProgram,
    Authorized,
    Lockup,
    sendAndConfirmTransaction,
    Transaction,
    LAMPORTS_PER_SOL,
  } from '@solana/web3.js';
  
  async function createStakeAccount(
    connection: Connection,
    userWallet: Keypair,
    validatorVoteAccount: PublicKey,
    amountToStake: number // in SOL
  ): Promise<PublicKey> {
    try {
      // Create a new stake account keypair
      const stakeAccount = Keypair.generate();
      
      // Calculate the rent-exempt reserve plus the stake amount
      const minimumRent = await connection.getMinimumBalanceForRentExemption(StakeProgram.space);
      const amountToStakeInLamports = amountToStake * LAMPORTS_PER_SOL;
      const totalAmount = minimumRent + amountToStakeInLamports;
  
      // Create stake account transaction
      const createStakeAccountTx = StakeProgram.createAccount({
        fromPubkey: userWallet.publicKey,
        stakePubkey: stakeAccount.publicKey,
        authorized: new Authorized(
          userWallet.publicKey, // staker
          userWallet.publicKey  // withdrawer
        ),
        lockup: new Lockup(0, 0, userWallet.publicKey), // No lockup
        lamports: totalAmount
      });
  
      // Create stake delegation transaction
      const delegateTx = StakeProgram.delegate({
        stakePubkey: stakeAccount.publicKey,
        authorizedPubkey: userWallet.publicKey,
        votePubkey: validatorVoteAccount
      });
  
      // Combine transactions
      const transaction = new Transaction()
        .add(createStakeAccountTx)
        .add(delegateTx);
  
      // Send and confirm transaction
      const signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [userWallet, stakeAccount],
        { commitment: 'confirmed' }
      );
  
      console.log('Stake account created and delegated successfully!');
      console.log('Transaction signature:', signature);
      console.log('Stake account public key:', stakeAccount.publicKey.toString());
  
      return stakeAccount.publicKey;
    } catch (error) {
      console.error('Error creating stake account:', error);
      throw error;
    }
  }
  
  // Example usage
  async function main() {
    // Initialize connection to Solana network
    const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
    
    // Your app's wallet that will create and manage stake accounts
    const appWallet = Keypair.generate(); // In production, load your actual keypair
    
    // Example validator vote account (replace with actual validator vote account)
    const validatorVoteAccount = new PublicKey('YOUR_VALIDATOR_VOTE_ACCOUNT_ADDRESS');
    
    // Amount to stake in SOL
    const amountToStake = 1; // 1 SOL
  
    try {
      const stakeAccountPubkey = await createStakeAccount(
        connection,
        appWallet,
        validatorVoteAccount,
        amountToStake
      );
  
      // Monitor stake account status
      const stakeAccount = await connection.getStakeActivation(stakeAccountPubkey);
      console.log('Stake account status:', stakeAccount.state);
    } catch (error) {
      console.error('Failed to create stake account:', error);
    }
  }
  
  // Don't call main() directly in production - integrate with your app's logic
  main();