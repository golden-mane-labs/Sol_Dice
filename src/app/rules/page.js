"use client"
import Footer from '@/components/footer';
import Navbar from '@/components/navbar';
import ClientOnly from '@/components/ClientOnly';
import React, { useState, useEffect } from 'react';
import { getAllWallets } from '@/utils/api';

export default function Rules() {
    const [games, setGames] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchGames = async () => {
            try {
                const wallets = await getAllWallets();
                // Transform wallet data to games format (static data from database)
                const transformedGames = wallets
                    .filter(w => w.is_active)
                    .sort((a, b) => b.multiplier - a.multiplier)
                    .map(wallet => {
                        const LAMPORTS_PER_SOL = 1_000_000_000;
                        const address = (wallet.address || '').replace(/^solana:/i, '');
                        const odds = wallet.chance ? `${wallet.chance.toFixed(2)}%` : 'N/A';
                        const maxRoll = 65535;
                        const betNumber = Math.floor(maxRoll / wallet.multiplier);
                        const minLamports = wallet.min_bet_lamports ?? wallet.min_bet_sats;
                        const maxLamports = wallet.max_bet_lamports ?? wallet.max_bet_sats;
                        const minBet = minLamports ? minLamports / LAMPORTS_PER_SOL : 0.0001;
                        const maxBet = maxLamports ? maxLamports / LAMPORTS_PER_SOL : 0.01;
                        return {
                            legacyAddress: address,
                            cashAddr: address,
                            maxRoll,
                            maxBet,
                            multiplier: wallet.multiplier,
                            betNumber,
                            minBet,
                            odds
                        };
                    });
                setGames(transformedGames);
            } catch (error) {
                console.error('Error fetching wallets:', error);
                // Fallback to empty array if API fails
                setGames([]);
            } finally {
                setLoading(false);
            }
        };
        
        fetchGames();
    }, []);

    return (
        <ClientOnly>
            <div className="min-h-screen bg-black" suppressHydrationWarning>
                <Navbar />
                {/* Rules Section */}
                <div className="px-10 py-10 md:pl-44 bg-black" suppressHydrationWarning>
                    <h1 className="text-2xl font-light tracking-wide text-[#FF8C00]" suppressHydrationWarning>Rules</h1>
                </div>

                <div className="max-w-6xl mx-auto px-6 py-10" suppressHydrationWarning>
                <div className="mb-8">
                    <p className="text-white leading-relaxed mb-6">
                        Solana Dice is a provably fair on-chain dice game on Solana. The system uses pre-committed server seeds and on-chain verification so every bet can be independently audited. Playing supports the continued operation of the game.
                    </p>

                    <p className="text-white leading-relaxed mb-6">
                        The game operates with fast finality on Solana: the time from sending a transaction to receiving your payout is typically under a minute. Each bet is tied to a server seed committed in advance; the payout transaction is built from the result of your bet.
                    </p>

                    <p className="text-white leading-relaxed">
                        Place a bet by sending SOL to one of the addresses in the bet options table. The system detects your transaction, evaluates win or lose, and sends back your payout. If you win, your bet is multiplied by the chosen multiplier.
                    </p>

                    <h3 className="text-xl font-semibold mt-8 mb-4 text-[#FF8C00]">Delays</h3>
                    <p className="text-white leading-relaxed mb-6">
                        If there is a problem with the software there might be delays in processing bets or creating return transactions. A transaction will always be evaluated with the date of when it was first seen by the software. This means if your transaction comes in on the 1st, the software will tag the transaction with that date. Then if the transaction fails and the program explodes, and it's not fixed until the 2nd, your transaction will still use the 1st for the purpose of lucky number selection.
                    </p>

                    <h3 className="text-xl font-semibold mt-8 mb-4 text-[#FF8C00]">Problems</h3>
                    <p className="text-white leading-relaxed mb-6">
                        If you have questions, <a href="https://t.me/Onlybitcoinsupport" target="_blank" rel="noopener noreferrer" className="text-[#FF8C00] underline cursor-pointer hover:text-[#FFA500]">contact support</a>.
                    </p>

                    <h3 className="text-xl font-semibold mt-8 mb-4 text-[#FF8C00]">Min / Max Bets</h3>
                    <p className="text-white leading-relaxed mb-6">
                        If you send funds with less than the minimum amount, the transaction will be ignored. If you send more than the maximum bet, you will play the max bet and the rest will be returned to you if you win.
                    </p>
                    <p className="text-white leading-relaxed mb-6">
                        Solana Dice is a fast, provably fair dice game on Solana.
                    </p>
                </div>
            </div>

                {/* FAQ Section */}
                <div className="px-10 py-10 md:pl-44 bg-black" suppressHydrationWarning>
                    <h1 className="text-2xl font-light tracking-wide text-[#FF8C00]" suppressHydrationWarning>FAQ</h1>
                </div>

                <div className="max-w-6xl mx-auto px-6 py-10" suppressHydrationWarning>
                <div className="mb-8">
                    <div className="mb-6">
                        <h3 className="text-lg font-semibold mb-3 text-[#FF8C00]">1. How can I play?</h3>
                        <p className="text-white leading-relaxed">
                            Send SOL to any of the listed addresses. Winnings are sent back to the same address. No registration required.
                        </p>
                    </div>

                    <div className="mb-6">
                        <h3 className="text-lg font-semibold mb-3 text-[#FF8C00]">2. How can I get a SOL wallet?</h3>
                        <p className="text-white leading-relaxed">
                            Use a Solana wallet such as Phantom, Solflare, or Backpack. Install the extension or app and secure your recovery phrase.
                        </p>
                    </div>

                    <div className="mb-6">
                        <h3 className="text-lg font-semibold mb-3 text-[#FF8C00]">3. Where can I buy SOL?</h3>
                        <p className="text-white leading-relaxed">
                            You can buy SOL on exchanges like Coinbase, Binance, Kraken, or other reputable platforms. Withdraw to your Solana wallet to play.
                        </p>
                    </div>
                </div>
            </div>

                {/* Available Games Section */}
                <div className="px-10 py-10 md:pl-44 bg-black" suppressHydrationWarning>
                    <h1 className="text-2xl font-light tracking-wide text-[#FF8C00]" suppressHydrationWarning>Available Games</h1>
                </div>

                <div className="max-w-6xl mx-auto px-6 py-10" suppressHydrationWarning>
                    {loading ? (
                        <div className="text-center py-10">
                            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[#FF8C00] mb-4"></div>
                            <p className="text-white">Loading games...</p>
                        </div>
                    ) : games.length === 0 ? (
                        <div className="text-center py-10">
                            <p className="text-white">No games available</p>
                        </div>
                    ) : (
                        <div className="space-y-4" suppressHydrationWarning>
                            {games.map((game, index) => (
                            <div key={index} className="bg-black/50 border border-[#FF8C00]/30 rounded-lg p-5" suppressHydrationWarning>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                                <div>
                                    <div className="text-white/70 mb-1">Legacy Address</div>
                                    <div className="text-white break-all">{game.legacyAddress}</div>
                                </div>
                                <div>
                                    <div className="text-white/70 mb-1">Maximum Roll</div>
                                    <div className="text-white">{game.maxRoll}</div>
                                </div>
                                <div>
                                    <div className="text-white/70 mb-1">Max Bet</div>
                                    <div className="text-white">{game.maxBet}</div>
                                </div>
                                <div>
                                    <div className="text-white/70 mb-1">Multiplier</div>
                                    <div className="text-white">{game.multiplier}</div>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm mt-4">
                                <div className="lg:col-span-2">
                                    <div className="text-white/70 mb-1">Address</div>
                                    <div className="text-white break-all">{game.cashAddr}</div>
                                </div>
                                <div>
                                    <div className="text-white/70 mb-1">Bet Number</div>
                                    <div className="text-white">{game.betNumber}</div>
                                </div>
                                <div>
                                    <div className="text-white/70 mb-1">Min Bet</div>
                                    <div className="text-white">{game.minBet}</div>
                                </div>
                                <div className="lg:col-start-4">
                                    <div className="text-white/70 mb-1">Odds</div>
                                    <div className="text-white">{game.odds}</div>
                                </div>
                            </div>
                        </div>
                            ))}
                        </div>
                    )}
                </div>
                <Footer />
            </div>
        </ClientOnly>
    );
}