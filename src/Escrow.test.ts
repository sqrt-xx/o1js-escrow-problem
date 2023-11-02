import { Escrow } from './Escrow';
import {
  Field,
  Mina,
  Provable,
  PrivateKey,
  PublicKey,
  AccountUpdate,
  UInt64
} from 'o1js';

let proofsEnabled = false;

async function deposit(
  zkApp: Escrow,
  actor_sk: PrivateKey
) {
  Provable.asProver(async () => {
    const actor_pk: PublicKey = actor_sk.toPublicKey();
    const tx = await Mina.transaction(actor_pk, () => {
      zkApp.deposit(actor_pk);
    });
    await tx.prove();
    await tx.sign([actor_sk]);
    await tx.send();
  });
}

describe('Escrow', () => {
  let
    deployerAccount: PublicKey,
    deployerKey: PrivateKey,
    aliceAccount: PublicKey,
    aliceKey: PrivateKey,
    bobAccount: PublicKey,
    bobKey: PrivateKey,
    zkAppAddress: PublicKey,
    zkAppPrivateKey: PrivateKey,
    zkApp: Escrow;

  beforeAll(async () => {
    if (proofsEnabled) await Escrow.compile();
  });

  beforeEach(() => {
    const Local = Mina.LocalBlockchain({ proofsEnabled });
    Mina.setActiveInstance(Local);

    // deployer actor
    ({ privateKey: deployerKey, publicKey: deployerAccount } =
      Local.testAccounts[0]);

    // actor Alice
    ({ privateKey: aliceKey, publicKey: aliceAccount } =
      Local.testAccounts[1]);

    // actor Bob
    ({ privateKey: bobKey, publicKey: bobAccount } =
      Local.testAccounts[2]);

    // zkApp keys
    zkAppPrivateKey = PrivateKey.random();
    zkAppAddress = zkAppPrivateKey.toPublicKey();

    // instantiate
    zkApp = new Escrow(zkAppAddress);
  });

  async function localDeploy() {
    const txn = await Mina.transaction(deployerAccount, () => {
      AccountUpdate.fundNewAccount(deployerAccount);
      zkApp.deploy();
    });
    await txn.prove();
    // this tx needs .sign(), because `deploy()` adds an account update that requires signature authorization
    await txn.sign([deployerKey, zkAppPrivateKey]).send();
  }

  it('generates and deploys the `Escrow` smart contract', async () => {
    const balance_initial = 1000000000000;
    const amount = 1000000;

    // deploy the contract
    await localDeploy()

    // Alice should have initial balance
    Mina.getBalance(aliceAccount).assertEquals(
      UInt64.from(balance_initial))

    // Bob should have initial balance
    Mina.getBalance(bobAccount).assertEquals(
      UInt64.from(balance_initial))

    // zkApp should have zero balance
    Mina.getBalance(zkAppAddress).assertEquals(
      UInt64.from(0))

    // Alice deposits
    await deposit(zkApp, aliceKey)

    // Alice should have initial balance - amount
    Mina.getBalance(aliceAccount).assertEquals(
      UInt64.from(balance_initial - amount))

    // Bob should still have initial balance
    Mina.getBalance(bobAccount).assertEquals(
      UInt64.from(balance_initial))

    // zkApp should have amount as balance
    Mina.getBalance(zkAppAddress).assertEquals(
      UInt64.from(amount))
  });
});
