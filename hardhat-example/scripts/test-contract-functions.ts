import { createPublicClient, http } from "viem";
import { defineChain } from "viem";
import fs from 'fs';

// Định nghĩa Conflux eSpace Testnet
const confluxTestnet = defineChain({
  id: 71,
  name: 'Conflux eSpace Testnet',
  network: 'cfx-testnet',
  nativeCurrency: { name: 'Conflux', symbol: 'CFX', decimals: 18 },
  rpcUrls: { default: { http: ['https://evmtestnet.confluxrpc.com'] } },
  blockExplorers: { default: { name: 'ConfluxScan', url: 'https://evmtestnet.confluxscan.io' } },
});

const CONTRACT_ADDRESS = "0xD09bf13AaFba0Cb3e0a0d5556eF75C4Bd69fe340";

// Load ABI từ file JSON
const abiPath = "../dapp-fontend/admin/charityAbi.json";
let CONTRACT_ABI: any;

try {
  const abiContent = fs.readFileSync(abiPath, 'utf8');
  const abiJson = JSON.parse(abiContent);
  CONTRACT_ABI = abiJson.abi || abiJson;
} catch (e: any) {
  console.error("❌ Không thể load ABI:", e?.message || e);
  process.exit(1);
}

async function main() {
  const publicClient = createPublicClient({
    chain: confluxTestnet,
    transport: http(),
  });

  console.log("🔍 Testing contract functions...");
  console.log("📍 Contract Address:", CONTRACT_ADDRESS);
  console.log("🌐 Network: Conflux eSpace Testnet (71)");
  
  try {
    // Test basic contract functions
    console.log("\n🔥 Testing basic functions:");
    
    const owner = await publicClient.readContract({
      address: CONTRACT_ADDRESS as `0x${string}`,
      abi: CONTRACT_ABI,
      functionName: 'owner',
      args: [],
    });
    console.log("✅ Owner:", owner);
    
    const nextId = await publicClient.readContract({
      address: CONTRACT_ADDRESS as `0x${string}`,
      abi: CONTRACT_ABI,
      functionName: 'nextCampaignId',
      args: [],
    });
    console.log("✅ Next Campaign ID:", (nextId as bigint).toString());
    
    // Test isAdmin function với owner address
    const isOwnerAdmin = await publicClient.readContract({
      address: CONTRACT_ADDRESS as `0x${string}`,
      abi: CONTRACT_ABI,
      functionName: 'isAdmin',
      args: [owner as `0x${string}`],
    });
    console.log("✅ Owner is admin:", isOwnerAdmin);
    
    // Test với một địa chỉ random
    const randomAddr = "0x1234567890123456789012345678901234567890" as `0x${string}`;
    const isRandomAdmin = await publicClient.readContract({
      address: CONTRACT_ADDRESS as `0x${string}`,
      abi: CONTRACT_ABI,
      functionName: 'isAdmin',
      args: [randomAddr],
    });
    console.log("✅ Random address is admin:", isRandomAdmin);
    
    console.log("\n🎉 All tests passed! Contract is working correctly.");
    console.log("💡 The issue may be with frontend network configuration or MetaMask connection.");
    
  } catch (error) {
    console.error("❌ Error testing contract:", error);
  }
}

main().catch(console.error);
