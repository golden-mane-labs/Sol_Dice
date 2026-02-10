"use client"
import Footer from '@/components/footer';
import Navbar from '@/components/navbar';
import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { getFairnessSeeds, getBetDetails, getBetByNumber, getHouseInfo } from '@/utils/api';

function ProvablyFairPageContent() {
    const searchParams = useSearchParams();
    const betId = searchParams.get('id');
    
    const [fairGames, setFairGames] = useState([]);
    const [betData, setBetData] = useState(null);
    const [betDetails, setBetDetails] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [mounted, setMounted] = useState(false);
    const [network, setNetwork] = useState('mainnet');

    useEffect(() => {
        setMounted(true);
        if (betId) {
            fetchBetFairnessData();
        } else {
            fetchSeeds();
        }
        fetchNetwork();
    }, [betId]);

    const fetchNetwork = async () => {
        try {
            const houseInfo = await getHouseInfo();
            if (houseInfo && houseInfo.network) {
                setNetwork(houseInfo.network);
            }
        } catch (err) {
            console.error('Failed to fetch network:', err);
        }
    };

    const formatDate = (isoDate) => {
        try {
            const date = new Date(isoDate);
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const month = months[date.getMonth()];
            const day = date.getDate();
            const year = date.getFullYear();
            return `${month} ${day}, ${year}`;
        } catch (err) {
            return isoDate; // Return original if parsing fails
        }
    };

    const fetchSeeds = async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await getFairnessSeeds();
            
            // Transform API response to match UI structure
            const transformedSeeds = data.seeds.map(seed => ({
                date: formatDate(seed.seed_date),
                serverSeed: seed.server_seed_hash,
                plaintext: seed.server_seed || "Not Published"
            }));
            
            setFairGames(transformedSeeds);
        } catch (err) {
            console.error('Error fetching fairness seeds:', err);
            setError(err.response?.data?.detail || err.message || 'Failed to load fairness seeds');
        } finally {
            setLoading(false);
        }
    };

    const fetchBetFairnessData = async () => {
        try {
            setLoading(true);
            setError(null);
            
            // Parse bet ID
            const betNum = parseInt(betId);
            if (isNaN(betNum)) {
                throw new Error(`Invalid bet ID: ${betId}`);
            }
            
            // Fetch bet verification data (provably fair info)
            // This endpoint accepts bet_number
            const verifyData = await getBetDetails(betNum);
            
            // Fetch bet details (txids, amounts, etc.)
            // This uses the new /api/bets/by-number endpoint
            let betInfo = null;
            try {
                betInfo = await getBetByNumber(betNum);
            } catch (betErr) {
                // If the new endpoint doesn't exist yet (404) or other error, continue without bet info
                console.warn('Could not fetch bet details, will use verification data only:', betErr);
                betInfo = null;
            }
            
            // If betInfo is null, we can still show verification data
            // but we'll need to get some info from verifyData
            let combinedData = {
                bet_number: verifyData.bet_number || betNum,
                deposit_txid: betInfo?.deposit_txid || null,
                payout_txid: betInfo?.payout_txid || null,
                bet_amount: betInfo?.bet_amount || null,
                payout_amount: betInfo?.payout_amount || null,
                is_win: betInfo?.is_win ?? (verifyData.roll ? verifyData.roll < 65535 * (1 / (verifyData.verification_data?.multiplier || 1)) : null),
                roll_result: verifyData.roll || null,
                created_at: betInfo?.created_at || null,
                payout_vout: betInfo?.payout_vout || null,
            };
            
            // Fetch server seed info to get publish time
            try {
                const seedsData = await getFairnessSeeds();
                const seedDate = combinedData.created_at ? new Date(combinedData.created_at).toISOString().split('T')[0] : null;
                const serverSeedInfo = seedsData.seeds?.find(s => s.seed_date === seedDate);
                combinedData.server_seed_publish_time = serverSeedInfo?.created_at || null;
            } catch (seedErr) {
                console.warn('Could not fetch server seed info:', seedErr);
                combinedData.server_seed_publish_time = null;
            }
            
            setBetDetails(verifyData);
            setBetData(combinedData);
        } catch (err) {
            console.error('Error fetching bet fairness data:', err);
            const errorMsg = err.response?.data?.detail || err.response?.data?.msg || err.message || 'Failed to load bet fairness data';
            setError(errorMsg);
        } finally {
            setLoading(false);
        }
    };

    const LAMPORTS_PER_SOL = 1_000_000_000;
    const formatSOL = (lamports) => {
        if (!lamports) return '0.0000';
        const sol = lamports / LAMPORTS_PER_SOL;
        return sol.toFixed(4);
    };

    const getTxUrl = (txid) => {
        if (!txid || txid === 'N/A') return '#';
        const isTestnet = network === 'testnet' || network === 'devnet';
        return isTestnet
            ? `https://explorer.solana.com/tx/${txid}?cluster=devnet`
            : `https://explorer.solana.com/tx/${txid}`;
    };

    const formatDateTime = (dateString) => {
        if (!dateString) return 'N/A';
        try {
            const date = new Date(dateString);
            return date.toLocaleString('en-US', { 
                year: 'numeric', 
                month: 'short', 
                day: 'numeric', 
                hour: '2-digit', 
                minute: '2-digit',
                timeZoneName: 'short'
            });
        } catch (err) {
            return dateString;
        }
    };


    return (
        <div className="min-h-screen bg-black">
            <Navbar />
            <div className="px-10 py-10 md:pl-28 bg-black" suppressHydrationWarning>
                <h1 className="text-2xl font-light tracking-wide text-white">Provably Fair</h1>
                <div className="mb-10 text-white">
                    <p className=" leading-relaxed mb-6">
                        Solana Dice is a provably fair on-chain Solana game.


                    </p>
                    <p className=" leading-relaxed mb-6">In order to ensure that there is no way for the system to change the outcome of a bet, the secret keys used are decided ahead of time. They are not released right away, since they could be used to submit selective transactions and win bets unfairly. However, the hash of the secrets is released and forever recorded in the blockchain. After the secrets are release users can verify that preceeding bets were provably fair.

                    </p>
                    <p className=" leading-relaxed mb-6">
                        Each bet transaction that comes in is assigned to the secret key of the current day when it is first processed. In most cases this will be as soon as the transaction is broadcast on the Solana network. However it could be later if the system has some problems processing or an outage. All times are in UTC (GMT).


                    </p>
                </div>
            </div>

            {/* Content Section */}
            <div className="max-w-7xl mx-auto px-6 py-10" suppressHydrationWarning>
                {!mounted || loading ? (
                    <div className="flex justify-center items-center min-h-[400px]">
                        <div className="text-center">
                            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-[#FF8C00] mb-4"></div>
                            <p className="text-white">Loading fairness data...</p>
                        </div>
                    </div>
                ) : error ? (
                    <div className="flex justify-center items-center min-h-[400px]">
                        <div className="text-center max-w-md">
                            <div className="text-red-400 text-xl mb-4">⚠️ Error Loading Data</div>
                            <p className="text-white mb-4">{error}</p>
                            <button
                                onClick={() => betId ? fetchBetFairnessData() : fetchSeeds()}
                                className="px-6 py-2 bg-[#FF8C00] text-white rounded-lg hover:bg-[#FFA500] transition"
                            >
                                Retry
                            </button>
                        </div>
                    </div>
                ) : betId && betDetails && betData ? (
                    <BetFairnessDetails 
                        betDetails={betDetails} 
                        betData={betData}
                        getTxUrl={getTxUrl}
                        formatSOL={formatSOL}
                        formatDateTime={formatDateTime}
                    />
                ) : fairGames.length === 0 ? (
                    <div className="flex justify-center items-center min-h-[400px]">
                        <div className="text-center">
                            <p className="text-white text-lg">No fairness data available</p>
                            <p className="text-white/70 text-sm mt-2">Please check back later</p>
                        </div>
                    </div>
                ) : (
                    <FairTable fairGames={fairGames} />
                )}

            </div>


            <Footer />
        </div>
    );
}

export default function ProvablyFairPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-black">
                <Navbar />
                <div className="flex justify-center items-center min-h-[400px]">
                    <div className="text-center">
                        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-[#FF8C00] mb-4"></div>
                        <p className="text-white">Loading...</p>
                    </div>
                </div>
            </div>
        }>
            <ProvablyFairPageContent />
        </Suspense>
    );
}

const BetFairnessDetails = ({ betDetails, betData, getTxUrl, formatSOL, formatDateTime }) => {
    const InfoCard = ({ label, value, isLink = false, linkUrl = null }) => (
        <div className="bg-black/50 border border-[#FF8C00] rounded-lg shadow-md p-4 md:p-5">
            {/* Mobile: Stacked layout with center alignment */}
            <div className="md:hidden text-center">
                <div className="font-semibold text-white mb-2 text-xs">{label}</div>
                <div className="text-white break-all text-xs">
                    {isLink && linkUrl ? (
                        <a 
                            href={linkUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-[#FF8C00] hover:text-[#FFA500] hover:underline"
                        >
                            {value}
                        </a>
                    ) : (
                        value
                    )}
                </div>
            </div>
            
            {/* Desktop: Side by side layout */}
            <div className="hidden md:flex md:justify-between md:items-center">
                <div className="font-semibold text-white">{label}</div>
                <div className="text-white break-all text-right flex-1 ml-4">
                    {isLink && linkUrl ? (
                        <a 
                            href={linkUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-[#FF8C00] hover:text-[#FFA500] hover:underline"
                        >
                            {value}
                        </a>
                    ) : (
                        value
                    )}
                </div>
            </div>
        </div>
    );

    return (
        <div className="w-full max-w-4xl mx-auto p-4 md:p-6">
            <h2 className="text-2xl font-bold text-white mb-6">Provably Fair Verification</h2>
            
            <div className="space-y-4">
                <InfoCard label="Game Id:" value={betDetails.bet_number?.toString() || betData.bet_number?.toString() || 'N/A'} />
                <InfoCard 
                    label="Deposit TXID:" 
                    value={betData.deposit_txid || 'N/A'} 
                    isLink={!!betData.deposit_txid}
                    linkUrl={betData.deposit_txid ? getTxUrl(betData.deposit_txid) : null}
                />
                <InfoCard label="Bet Number:" value={betDetails.bet_number?.toString() || betData.bet_number?.toString() || 'N/A'} />
                <InfoCard label="Random Number Seed:" value={betDetails.client_seed || 'N/A'} />
                <InfoCard label="Dice Roll:" value={betDetails.roll?.toString() || betData.roll_result?.toString() || 'N/A'} />
                <InfoCard 
                    label="Outcome:" 
                    value={betData.is_win ? 'Win' : 'Loss'} 
                />
                <InfoCard 
                    label="Payout TXID:" 
                    value={betData.payout_txid || 'N/A'} 
                    isLink={!!betData.payout_txid}
                    linkUrl={betData.payout_txid ? getTxUrl(betData.payout_txid) : null}
                />
                <InfoCard label="Vout:" value={betData.payout_vout !== null && betData.payout_vout !== undefined ? betData.payout_vout.toString() : 'N/A'} />
                <InfoCard label="Bet Amount:" value={betData.bet_amount ? `${formatSOL(betData.bet_amount)} SOL` : 'N/A'} />
                <InfoCard label="Payout Amount:" value={betData.payout_amount ? `${formatSOL(betData.payout_amount)} SOL` : (betData.is_win ? '0.0000 SOL' : 'N/A')} />
                <InfoCard label="Server Seed Hash:" value={betDetails.server_seed_hash || 'N/A'} />
                <InfoCard 
                    label="Server Seed Plaintext:" 
                    value={betDetails.server_seed ? betDetails.server_seed : 'Not Published'} 
                />
                <InfoCard 
                    label="Server Seed Publish Time:" 
                    value={betData.server_seed_publish_time ? formatDateTime(betData.server_seed_publish_time) : 'Not Published'} 
                />
                
                {betDetails.verification_data && (
                    <div className="bg-black/50 border border-[#FF8C00] rounded-lg shadow-md p-4 md:p-5">
                        <div className="md:hidden text-center">
                            <div className="font-semibold text-white mb-2 text-xs">Verification Status:</div>
                            <div className={`text-xs ${betDetails.is_valid ? 'text-green-400' : 'text-red-400'}`}>
                                {betDetails.is_valid ? '✓ Valid' : '✗ Invalid'}
                            </div>
                        </div>
                        <div className="hidden md:flex md:justify-between md:items-center">
                            <div className="font-semibold text-white">Verification Status:</div>
                            <div className={betDetails.is_valid ? 'text-green-400' : 'text-red-400'}>
                                {betDetails.is_valid ? '✓ Valid' : '✗ Invalid'}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

const FairTable = ({ fairGames }) => {
    return (
        <div className="w-full max-w-6xl mx-auto p-4 min-h-screen">

            <div className="grid grid-cols-3 md:gap-4 gap-1 mb-4 px-6 py-4 bg-black/50 border border-[#FF8C00]/20 rounded-xl shadow-sm">
                <div className="text-center font-medium text-white">Use Date</div>
                <div className="text-center font-medium text-white">Server Seed Hash</div>
                <div className="text-center font-medium text-white">Server Seed Plaintext</div>
            </div>

            <div className="space-y-4">
                {fairGames.map((game, index) => (
                    <div
                        key={index}
                        className="grid grid-cols-3 gap-4 items-center px-6 py-8 bg-black/50 border border-[#FF8C00]/20 rounded-xl shadow-sm  transition-colors"
                    >
                        {/* Date Column */}
                        <div className="text-center font-medium text-white">
                            {game.date}
                        </div>

                        {/* Hash Column (Orange Link Style) */}
                        <div className="text-center">
                            <span className="text-[#FF8C00] font-mono text-xs break-all cursor-pointer hover:text-[#FFA500] hover:underline transition-colors">
                                {game.serverSeed}
                            </span>
                        </div>

                        {/* Plaintext Column */}
                        <div className="text-center font-mono text-sm text-white break-all">
                            {game.plaintext === "Not Published" ? (
                                <span className="text-white/50 italic">Not Published</span>
                            ) : (
                                game.plaintext
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};