import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { defineChain } from "viem";

// Conflux eSpace Testnet
const confluxTestnet = defineChain({
  id: 71,
  name: 'Conflux eSpace Testnet',
  network: 'cfx-testnet',
  nativeCurrency: { name: 'Conflux', symbol: 'CFX', decimals: 18 },
  rpcUrls: { default: { http: ['https://evmtestnet.confluxrpc.com'] } },
  blockExplorers: { default: { name: 'ConfluxScan', url: 'https://evmtestnet.confluxscan.io' } },
});

const PRIVATE_KEY = "0xa3e0672445a0a6b383cdb10d9f3ab4cf612d21b3c0f37f691b3e8ca34b39538e" as `0x${string}`;
const CONTRACT_ADDRESS = "0xD09bf13AaFba0Cb3e0a0d5556eF75C4Bd69fe340" as `0x${string}`;

// Minimal ABI for testing
const MINIMAL_ABI = [
  {
    "inputs": [],
    "name": "owner",
    "outputs": [{"internalType": "address", "name": "", "type": "address"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "address", "name": "", "type": "address"}],
    "name": "isAdmin",
    "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "nextCampaignId",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  }
] as const;

async function main() {
  console.log("🚀 Testing contract with minimal setup...");
  
  const account = privateKeyToAccount(PRIVATE_KEY);
  console.log("📝 Account:", account.address);
  
  const publicClient = createPublicClient({
    chain: confluxTestnet,
    transport: http(),
  });
  
  try {
    console.log("🔍 Testing basic contract calls...");
    
    // Test 1: Owner
    const owner = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: MINIMAL_ABI,
      functionName: 'owner',
    });
    console.log("✅ Contract Owner:", owner);
    
    // Test 2: NextCampaignId
    const nextId = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: MINIMAL_ABI,
      functionName: 'nextCampaignId',
    });
    console.log("✅ Next Campaign ID:", nextId.toString());
    
    // Test 3: Check if owner is admin
    const ownerIsAdmin = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: MINIMAL_ABI,
      functionName: 'isAdmin',
      args: [owner],
    });
    console.log("✅ Owner is Admin:", ownerIsAdmin);
    
    // Test 4: Check if deployed account is admin
    const deployerIsAdmin = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: MINIMAL_ABI,
      functionName: 'isAdmin',
      args: [account.address],
    });
    console.log("✅ Deployer is Admin:", deployerIsAdmin);
    
    console.log("\n🎉 All contract calls successful!");
    console.log("📊 Summary:");
    console.log(`   Owner: ${owner}`);
    console.log(`   Deployer: ${account.address}`);
    console.log(`   Same address: ${owner.toLowerCase() === account.address.toLowerCase()}`);
    console.log(`   Owner has admin rights: ${ownerIsAdmin}`);
    console.log(`   Next campaign ID: ${nextId}`);
    
  } catch (error) {
    console.error("❌ Error during testing:", error);
  }
}

main().catch(console.error);
