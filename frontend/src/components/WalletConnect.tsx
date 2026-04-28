import { useWallet } from "@/hooks/useWallet";

interface Props {
  /** Render children only when wallet is connected */
  children: React.ReactNode;
}

/** Gate component — shows connect prompt until wallet is connected. */
export default function WalletConnect({ children }: Props) {
  const { isConnected, isConnecting, error, connect } = useWallet();

  if (isConnected) return <>{children}</>;

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
      <p className="text-gray-400">Connect your wallet to continue</p>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        onClick={connect}
        disabled={isConnecting}
        className="rounded-lg bg-indigo-600 px-6 py-3 font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
      >
        {isConnecting ? "Connecting…" : "Connect MetaMask"}
      </button>
    </div>
  );
}
