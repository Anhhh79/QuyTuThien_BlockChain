import { createPublicClient, http } from "viem";
import { defineChain } from "viem";

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

async function main() {
  const publicClient = createPublicClient({
    chain: confluxTestnet,
    transport: http(),
  });

  try {
    console.log("🔍 Kiểm tra contract tại:", CONTRACT_ADDRESS);
    
    // Kiểm tra xem contract có tồn tại không
    const code = await publicClient.getBytecode({
      address: CONTRACT_ADDRESS as `0x${string}`,
    });
    
    if (!code || code === "0x") {
      console.log("❌ Contract không tồn tại tại địa chỉ này!");
      return;
    }
    
    console.log("✅ Contract tồn tại");
    console.log("📝 Bytecode length:", code.length);
    
    // Thử gọi một số function cơ bản
    try {
      // Thử call owner function
      const ownerCall = await publicClient.call({
        to: CONTRACT_ADDRESS as `0x${string}`,
        data: "0x8da5cb5b" // owner() function selector
      });
      console.log("✅ Owner function call successful:", ownerCall.data);
    } catch (e) {
      console.log("❌ Owner function call failed:", e);
    }
    
    try {
      // Thử call nextCampaignId function
      const nextIdCall = await publicClient.call({
        to: CONTRACT_ADDRESS as `0x${string}`,
        data: "0x61b8ce8c" // nextCampaignId() function selector
      });
      console.log("✅ NextCampaignId function call successful:", nextIdCall.data);
    } catch (e) {
      console.log("❌ NextCampaignId function call failed:", e);
    }
    
  } catch (error) {
    console.error("❌ Lỗi kiểm tra contract:", error);
  }
}

main().catch(console.error);
