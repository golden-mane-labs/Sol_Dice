"use client"
import { useState, useEffect, useCallback, useRef } from 'react';
import { getBetHistory, getSolPrice, getWebSocketUrl, getHouseInfo } from '@/utils/api';
import { useWebSocket } from '@/utils/websocket';

export default function BettingHistory() {
    const LAMPORTS_PER_SOL = 1_000_000_000;
    const [USD_RATE, setUSD_RATE] = useState(200.0); // SOL fallback price
    const [network, setNetwork] = useState('mainnet');
    
    // Fetch SOL price and network on mount
    useEffect(() => {
        const fetchPriceAndNetwork = async () => {
            try {
                const price = await getSolPrice();
                setUSD_RATE(price);
                const houseInfo = await getHouseInfo();
                if (houseInfo && houseInfo.network) {
                    setNetwork(houseInfo.network);
                } else {
                    setNetwork('mainnet');
                }
            } catch (error) {
                console.error('Failed to fetch SOL price or network:', error);
                setUSD_RATE(200.0);
            }
        };
        fetchPriceAndNetwork();
    }, []);

    // State management
    const [bets, setBets] = useState([]);
    const [loading, setLoading] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalItems, setTotalItems] = useState(0);
    const [mobilePageInput, setMobilePageInput] = useState('1');
    const [activeTab, setActiveTab] = useState('all');
    const [search] = useState('');
    const [sort] = useState('newest');
    const [error, setError] = useState(null);

    const loadingRef = useRef(false);
    const ITEMS_PER_PAGE = 10;
    
    // Sync mobile page input with current page
    useEffect(() => {
        setMobilePageInput(currentPage.toString());
    }, [currentPage]);
    
    // WebSocket connection status
    const [wsConnected, setWsConnected] = useState(false);

    // Format bet amount from lamports to SOL (short format)
    const formatBetAmount = (lamports) => {
        const sol = lamports / LAMPORTS_PER_SOL;
        if (sol >= 1) return sol.toFixed(2);
        if (sol >= 0.01) return sol.toFixed(4);
        return sol.toFixed(6);
    };
    
    const formatSOLShort = (solString) => {
        if (!solString || solString === 'N/A' || solString === '0.00') return '0.00';
        const num = parseFloat(solString);
        if (isNaN(num)) return '0.00';
        if (num >= 1000) return num.toFixed(0);
        if (num >= 100) return num.toFixed(1);
        if (num >= 10) return num.toFixed(2);
        if (num >= 1) return num.toFixed(2);
        if (num >= 0.1) return num.toFixed(3);
        if (num >= 0.01) return num.toFixed(4);
        return num.toFixed(5);
    };

    // Format time ago
    const formatTimeAgo = (dateString) => {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
        if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
        if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
        return date.toLocaleDateString();
    };

    // Transform bet data for display
    const transformBetForDisplay = (bet) => {
        try {
            const isWin = bet.is_win === true; // Explicitly check for true
            const payoutAmount = bet.payout_amount || 0;
            
            // Calculate win threshold: max_roll * (chance / 100)
            const MAX_ROLL = 65535;
            const winChance = bet.win_chance || (bet.target_multiplier ? (1 / bet.target_multiplier * 100) : 0);
            const winThreshold = Math.floor(MAX_ROLL * (winChance / 100));
            
            // Check if bet is pending (not rolled yet)
            const isPending = bet.roll_result === undefined || bet.roll_result === null;
            
            return {
                id: bet.bet_id || bet.bet_number?.toString() || 'unknown',
                result: isPending ? 'pending' : (isWin ? 'win' : 'lose'),
                betAmount: formatBetAmount(bet.bet_amount || 0),
                betAmountSat: bet.bet_amount || 0,
                betUsd: `$${((bet.bet_amount || 0) / LAMPORTS_PER_SOL * USD_RATE).toFixed(2)}`,
                payout: isWin ? formatBetAmount(payoutAmount) : '0.00',
                payoutAmountSat: isWin ? payoutAmount : 0,
                payoutUsd: isWin ? `$${(payoutAmount / LAMPORTS_PER_SOL * USD_RATE).toFixed(2)}` : '$0.00',
                time: formatTimeAgo(bet.created_at),
                gameId: bet.bet_number || (bet.bet_id ? bet.bet_id.slice(-8) : 'N/A'),
                depositTx: bet.deposit_txid ? `${bet.deposit_txid.slice(0, 10)}...` : 'N/A',
                depositTxFull: bet.deposit_txid || null,
                payoutTx: bet.payout_txid ? `${bet.payout_txid.slice(0, 10)}...` : 'N/A',
                payoutTxFull: bet.payout_txid || null,
                bet: winThreshold, // Win threshold: max_roll * chance
                roll: bet.roll_result !== undefined && bet.roll_result !== null ? bet.roll_result : 'N/A'
            };
        } catch (error) {
            console.error('Error transforming bet:', error, bet);
            return null; // Return null to filter out invalid bets
        }
    };

    // Fetch bets function
    const fetchBets = useCallback(async (pageNum = 1) => {
        if (loadingRef.current) return; // Prevent concurrent requests
        loadingRef.current = true;

        try {
            setLoading(true);
            setError(null);

            console.log('Fetching bets for page:', pageNum);
            console.log('Query params:', { page: pageNum, page_size: ITEMS_PER_PAGE, filter: activeTab, sort, search });

            const response = await getBetHistory('all', {
                page: pageNum,
                page_size: ITEMS_PER_PAGE,
                filter: activeTab,
                sort: sort,
                search: search || null
            });

            if (!response) {
                console.error('No response received');
                setError('No response from server');
                setBets([]);
                return;
            }

            if (!response.bets) {
                console.error('Response missing bets array:', response);
                setError('Invalid response structure: missing bets array');
                setBets([]);
                return;
            }

            const transformedBets = response.bets.map(transformBetForDisplay).filter(bet => bet !== null);
            
            // Handle pagination - response should always have pagination object from getBetHistory
            if (response.pagination) {
                const pages = response.pagination.total_pages || 1;
                const items = response.pagination.total_bets || 0; // API returns 'total_bets', not 'total'
                setTotalPages(pages);
                setTotalItems(items);
                console.log('[Bet History] Pagination from API:', { 
                    pages, 
                    items, 
                    currentPage: pageNum, 
                    betsReceived: transformedBets.length,
                    pageSize: ITEMS_PER_PAGE,
                    shouldShowPagination: pages > 1,
                    fullPagination: response.pagination
                });
            } else {
                // Fallback: This shouldn't happen, but if it does, calculate from received bets
                // Note: This is incorrect if we only received a page of results
                const total = response.total || transformedBets.length;
                const calculatedPages = Math.max(1, Math.ceil(total / ITEMS_PER_PAGE));
                setTotalItems(total);
                setTotalPages(calculatedPages);
                console.warn('[Bet History] Response missing pagination object, using fallback calculation:', { 
                    total, 
                    calculatedPages, 
                    betsReceived: transformedBets.length,
                    pageSize: ITEMS_PER_PAGE 
                });
            }
            
            // Set bets after pagination is calculated
            setBets(transformedBets);

        } catch (err) {
            console.error('Error fetching bets:', err);
            console.error('Error details:', err.response?.data);
            setError(err.response?.data?.detail || err.response?.data?.message || err.message || 'Failed to load bet history');
            setBets([]);
        } finally {
            setLoading(false);
            loadingRef.current = false;
        }
    }, [activeTab, sort, search]);

    // Effect for initial load and filter/search changes
    useEffect(() => {
        setCurrentPage(1);
        setBets([]);
        loadingRef.current = false;
        fetchBets(1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, sort, search]);

    // Effect for page changes
    useEffect(() => {
        if (currentPage > 0) {
            fetchBets(currentPage);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentPage]);

    // Poll bet history every 10 seconds (only refresh current page)
    useEffect(() => {
        const intervalId = setInterval(() => {
            console.log('[Bet History] Polling bet history...');
            if (!loadingRef.current) {
                fetchBets(currentPage);
            }
        }, 10000); // 10 seconds

        return () => {
            clearInterval(intervalId);
            console.log('[Bet History] Stopped polling bet history');
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, sort, search, currentPage]);

    // WebSocket message handler for new bets
    const handleBetMessage = useCallback((message) => {
        if (message.type === 'new_bet' && message.bet) {
            console.log('[Bet History] Received new bet via WebSocket:', message.bet);
            
            // Refresh current page when new bet arrives (only if on first page)
            if (currentPage === 1 && !loadingRef.current) {
                fetchBets(1);
            }
        } else {
            console.log('[Bet History] Received non-bet message:', message.type);
        }
    }, [currentPage, fetchBets]);

    // WebSocket error handler
    const handleWebSocketError = useCallback((error) => {
        console.error('[Bet History WebSocket] Error:', error);
    }, []);

    // WebSocket connect handler
    const handleWebSocketConnect = useCallback(() => {
        console.log('[Bet History WebSocket] Connected to bet updates');
        setWsConnected(true);
    }, []);

    // Connect to WebSocket for real-time bet updates
    const wsUrl = getWebSocketUrl();
    console.log('[Bet History] WebSocket URL:', wsUrl);
    const { isConnected } = useWebSocket(
        wsUrl,
        handleBetMessage,
        handleWebSocketError,
        handleWebSocketConnect
    );

    // Update connection status
    useEffect(() => {
        setWsConnected(isConnected);
    }, [isConnected]);

    const getTxUrl = (txid) => {
        if (!txid || txid === 'N/A') return '#';
        const isTestnet = network === 'testnet' || network === 'TESTNET' || network === 'devnet';
        return isTestnet
            ? `https://explorer.solana.com/tx/${txid}?cluster=devnet`
            : `https://explorer.solana.com/tx/${txid}`;
    };

    return (
        <div className="min-h-screen bg-black p-4">
            <div className="max-w-7xl mx-auto">
                {/* Header with Title */}
                <div className="mb-6">
                    <h1 className="text-3xl font-bold text-white text-center mb-4">All Bets History</h1>
                    
                    {/* Pagination Controls - Below title, right-aligned */}
                    {totalPages > 1 && (
                        <div className="flex justify-end items-center gap-2">
                            {/* Mobile Pagination: <, input, > */}
                            <div className="flex items-center gap-2 md:hidden">
                                <button
                                    onClick={() => {
                                        const newPage = Math.max(1, currentPage - 1);
                                        setCurrentPage(newPage);
                                        setMobilePageInput(newPage.toString());
                                    }}
                                    disabled={currentPage === 1 || loading}
                                    className={`px-3 py-2 rounded-lg font-semibold text-sm transition-colors ${
                                        currentPage === 1 || loading
                                            ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                                            : 'bg-[#FF8C00] text-white hover:bg-[#FFA500]'
                                    }`}
                                >
                                    &lt;
                                </button>
                                
                                <input
                                    type="number"
                                    min="1"
                                    max={totalPages}
                                    value={mobilePageInput}
                                    onChange={(e) => {
                                        const value = e.target.value;
                                        setMobilePageInput(value);
                                    }}
                                    onBlur={(e) => {
                                        const page = parseInt(e.target.value) || 1;
                                        const validPage = Math.max(1, Math.min(totalPages, page));
                                        setCurrentPage(validPage);
                                        setMobilePageInput(validPage.toString());
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            const page = parseInt(mobilePageInput) || 1;
                                            const validPage = Math.max(1, Math.min(totalPages, page));
                                            setCurrentPage(validPage);
                                            setMobilePageInput(validPage.toString());
                                            e.target.blur();
                                        }
                                    }}
                                    disabled={loading}
                                    className="w-16 px-2 py-2 rounded-lg font-semibold text-sm text-center bg-black/50 text-white border border-[#FF8C00] focus:outline-none focus:ring-2 focus:ring-[#FF8C00] disabled:opacity-50"
                                />
                                
                                <button
                                    onClick={() => {
                                        const newPage = Math.min(totalPages, currentPage + 1);
                                        setCurrentPage(newPage);
                                        setMobilePageInput(newPage.toString());
                                    }}
                                    disabled={currentPage === totalPages || loading}
                                    className={`px-3 py-2 rounded-lg font-semibold text-sm transition-colors ${
                                        currentPage === totalPages || loading
                                            ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                                            : 'bg-[#FF8C00] text-white hover:bg-[#FFA500]'
                                    }`}
                                >
                                    &gt;
                                </button>
                            </div>
                            
                            {/* Desktop Pagination: <, 1, 2, 3, 4, ..., end, > */}
                            <div className="hidden md:flex items-center gap-1">
                                {/* Previous Button */}
                                <button
                                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                    disabled={currentPage === 1 || loading}
                                    className={`px-3 py-2 rounded-lg font-semibold text-sm transition-colors ${
                                        currentPage === 1 || loading
                                            ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                                            : 'bg-[#FF8C00] text-white hover:bg-[#FFA500]'
                                    }`}
                                >
                                    &lt;
                                </button>
                                
                                {/* First Page */}
                                {currentPage > 3 && totalPages > 5 && (
                                    <>
                                        <button
                                            onClick={() => setCurrentPage(1)}
                                            disabled={loading}
                                            className={`w-10 h-10 rounded-lg font-semibold text-sm transition-colors ${
                                                currentPage === 1
                                                    ? 'bg-[#FF8C00] text-white'
                                                    : 'bg-black/50 text-white/70 hover:bg-[#FF8C00]/30'
                                            } ${loading ? 'cursor-not-allowed opacity-50' : ''}`}
                                        >
                                            1
                                        </button>
                                        {currentPage > 4 && (
                                            <span className="text-white/70 px-1">...</span>
                                        )}
                                    </>
                                )}
                                
                                {/* Page Numbers around current page */}
                                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                    let pageNum;
                                    if (totalPages <= 5) {
                                        pageNum = i + 1;
                                    } else if (currentPage <= 3) {
                                        pageNum = i + 1;
                                    } else if (currentPage >= totalPages - 2) {
                                        pageNum = totalPages - 4 + i;
                                    } else {
                                        pageNum = currentPage - 2 + i;
                                    }
                                    
                                    // Skip if already shown as first page
                                    if (currentPage > 3 && totalPages > 5 && pageNum === 1) {
                                        return null;
                                    }
                                    
                                    return (
                                        <button
                                            key={pageNum}
                                            onClick={() => setCurrentPage(pageNum)}
                                            disabled={loading}
                                            className={`w-10 h-10 rounded-lg font-semibold text-sm transition-colors ${
                                                currentPage === pageNum
                                                    ? 'bg-[#FF8C00] text-white'
                                                    : 'bg-black/50 text-white/70 hover:bg-[#FF8C00]/30'
                                            } ${loading ? 'cursor-not-allowed opacity-50' : ''}`}
                                        >
                                            {pageNum}
                                        </button>
                                    );
                                }).filter(Boolean)}
                                
                                {/* Last Page */}
                                {currentPage < totalPages - 2 && totalPages > 5 && (
                                    <>
                                        {currentPage < totalPages - 3 && (
                                            <span className="text-white/70 px-1">...</span>
                                        )}
                                        <button
                                            onClick={() => setCurrentPage(totalPages)}
                                            disabled={loading}
                                            className={`w-10 h-10 rounded-lg font-semibold text-sm transition-colors ${
                                                currentPage === totalPages
                                                    ? 'bg-[#FF8C00] text-white'
                                                    : 'bg-black/50 text-white/70 hover:bg-[#FF8C00]/30'
                                            } ${loading ? 'cursor-not-allowed opacity-50' : ''}`}
                                        >
                                            {totalPages}
                                        </button>
                                    </>
                                )}
                                
                                {/* Next Button */}
                                <button
                                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                    disabled={currentPage === totalPages || loading}
                                    className={`px-3 py-2 rounded-lg font-semibold text-sm transition-colors ${
                                        currentPage === totalPages || loading
                                            ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                                            : 'bg-[#FF8C00] text-white hover:bg-[#FFA500]'
                                    }`}
                                >
                                    &gt;
                                </button>
                            </div>
                        </div>
                    )}
                </div>
                
                {/* Error display removed */}

                {/* Filter Tabs */}
                <div className="grid grid-cols-4 gap-0 mb-6 border-2 border-[#FF8C00]/30 rounded-lg overflow-hidden bg-black/50">
                    <button
                        onClick={() => setActiveTab('all')}
                        className={`py-2 md:py-4 text-xs md:text-base font-semibold transition-colors relative
                        ${activeTab === 'all'
                                ? 'bg-[#FF8C00] text-white'
                                : 'bg-black/50 text-white/70 hover:bg-[#FF8C00]/30'
                            }`}
                    >
                        All
                        {activeTab === 'all' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#FFA500]"></div>}
                    </button>
                    <button
                        onClick={() => setActiveTab('wins')}
                        className={`py-2 md:py-4 text-xs md:text-base font-semibold transition-colors relative border-l-2 border-[#FF8C00]/30
                        ${activeTab === 'wins'
                                ? 'bg-[#FF8C00] text-white'
                                : 'bg-black/50 text-white/70 hover:bg-[#FF8C00]/30'
                            }`}
                    >
                        Wins
                        {activeTab === 'wins' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#FFA500]"></div>}
                    </button>
                    <button
                        onClick={() => setActiveTab('big_wins')}
                        className={`py-2 md:py-4 text-xs md:text-base font-semibold transition-colors relative border-l-2 border-[#FF8C00]/30
                        ${activeTab === 'big_wins'
                                ? 'bg-[#FF8C00] text-white'
                                : 'bg-black/50 text-white/70 hover:bg-[#FF8C00]/30'
                            }`}
                    >
                        Big Wins
                        {activeTab === 'big_wins' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#FFA500]"></div>}
                    </button>
                    <button
                        onClick={() => setActiveTab('rare_wins')}
                        className={`py-2 md:py-4 text-xs md:text-base font-semibold transition-colors relative border-l-2 border-[#FF8C00]/30
                        ${activeTab === 'rare_wins'
                                ? 'bg-[#FF8C00] text-white'
                                : 'bg-black/50 text-white/70 hover:bg-[#FF8C00]/30'
                            }`}
                    >
                        Rare Wins
                        {activeTab === 'rare_wins' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#FFA500]"></div>}
                    </button>
                </div>

                {/* Bet List */}
                <div className="space-y-4">
                    {bets.length > 0 ? (
                        <>
                            {bets.map((item) => (
                                <div key={item.id} className="bg-black/50 border border-[#FF8C00]/20 rounded-lg p-2 md:p-3 max-w-full">
                                    {/* Mobile Layout */}
                                    <div className="flex flex-col lg:hidden gap-3">
                                        {/* Result Section - Centered at top */}
                                        <div className="flex flex-col items-center">
                                            <div className="text-xs font-semibold text-white mb-1">Result</div>
                                            <div className="flex flex-col items-center gap-1">
                                                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0`}>
                                            {item.result === 'win' ? (
                                                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                            <path d="M10 0C4.48 0 0 4.48 0 10C0 15.52 4.48 20 10 20C15.52 20 20 15.52 20 10C20 4.48 15.52 0 10 0ZM8 15L3 10L4.41 8.59L8 12.17L15.59 4.58L17 6L8 15Z" fill="#00FFA3" />
                                                </svg>
                                            ) : item.result === 'pending' ? (
                                                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                    <g>
                                                        <circle cx="10" cy="10" r="8" stroke="#00FFA3" strokeWidth="2" fill="none" strokeDasharray="12.566" strokeDashoffset="12.566">
                                                            <animate attributeName="stroke-dasharray" values="0,12.566;6.283,6.283;0,12.566" dur="1.5s" repeatCount="indefinite" />
                                                            <animate attributeName="stroke-dashoffset" values="0;-6.283;-12.566" dur="1.5s" repeatCount="indefinite" />
                                                        </circle>
                                                        <circle cx="10" cy="10" r="5" stroke="#00FFA3" strokeWidth="1.5" fill="none" opacity="0.5" strokeDasharray="7.854" strokeDashoffset="7.854">
                                                            <animate attributeName="stroke-dasharray" values="0,7.854;3.927,3.927;0,7.854" dur="1.5s" repeatCount="indefinite" />
                                                            <animate attributeName="stroke-dashoffset" values="0;-3.927;-7.854" dur="1.5s" repeatCount="indefinite" />
                                                        </circle>
                                                    </g>
                                                </svg>
                                            ) : (
                                                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                    <path d="M10 0C4.47 0 0 4.47 0 10C0 15.53 4.47 20 10 20C15.53 20 20 15.53 20 10C20 4.47 15.53 0 10 0ZM15 13.59L13.59 15L10 11.41L6.41 15L5 13.59L8.59 10L5 6.41L6.41 5L10 8.59L13.59 5L15 6.41L11.41 10L15 13.59Z" fill="#3C3C3C" />
                                                </svg>
                                            )}
                                        </div>
                                                <span className={`text-sm font-semibold capitalize ${item.result === 'win' ? 'text-[#FF8C00]' : item.result === 'pending' ? 'text-[#FF8C00]' : 'text-white/50'}`}>
                                            {item.result}
                                        </span>
                                    </div>
                                </div>

                                        {/* Bet Amount & Payout - Side by side */}
                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="border border-[#FF8C00]/30 bg-black/50 rounded-md p-1.5 text-center">
                                                <div className="text-[10px] font-semibold text-white mb-0.5">Bet Amount</div>
                                                <div className="font-semibold text-[11px] leading-tight truncate text-[#FF8C00]">
                                                    {formatSOLShort(item.betAmount)} SOL
                                                </div>
                                                <div className="text-[9px] text-white/70 mt-0.5">{item.betUsd}</div>
                                            </div>
                                            <div className="border border-[#FF8C00]/30 bg-black/50 rounded-md p-1.5 text-center">
                                                <div className="text-[10px] font-semibold text-white mb-0.5">Payout</div>
                                                <div className={`font-semibold text-[11px] leading-tight truncate ${item.result === 'win' ? 'text-[#FF8C00]' : 'text-white/50'}`}>
                                                    {formatSOLShort(item.payout)} SOL
                                        </div>
                                                <div className="text-[9px] text-white/70 mt-0.5">{item.payoutUsd}</div>
                                    </div>
                                </div>

                                        {/* Details - Two columns */}
                                        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[#FF8C00]/20">
                                            {/* Left Column */}
                                            <div className="space-y-2 text-center">
                                                <div>
                                                    <div className="text-[10px] font-semibold text-white mb-0.5">Time</div>
                                                    <div className="text-[11px] text-white">{item.time}</div>
                                                </div>
                                                <div>
                                                    <div className="text-[10px] font-semibold text-white mb-0.5">Deposit TX</div>
                                                    <a 
                                                        href={getTxUrl(item.depositTxFull)}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-[11px] text-[#FF8C00] hover:text-[#FFA500] hover:underline cursor-pointer truncate block"
                                                        title={item.depositTxFull}
                                                    >
                                                        {item.depositTx}
                                                    </a>
                                                </div>
                                                <div>
                                                    <div className="text-[10px] font-semibold text-white mb-0.5">Bet</div>
                                                    <div className="text-[11px] text-white">{typeof item.bet === 'number' ? item.bet : 'N/A'}</div>
                                                </div>
                                            </div>
                                            {/* Right Column */}
                                            <div className="space-y-2 text-center">
                                                <div>
                                                    <div className="text-[10px] font-semibold text-white mb-0.5">Game ID</div>
                                                    <a 
                                                        href={`/fair?id=${item.gameId}`}
                                                        className="text-[11px] text-[#FF8C00] hover:text-[#FFA500] hover:underline cursor-pointer truncate block"
                                                    >
                                                        {item.gameId}
                                                    </a>
                                                </div>
                                                <div>
                                                    <div className="text-[10px] font-semibold text-white mb-0.5">Payout TX</div>
                                                    {item.payoutTx === 'N/A' ? (
                                                        <div className="text-[11px] text-white/50">N/A</div>
                                                    ) : (
                                                        <a 
                                                            href={getTxUrl(item.payoutTxFull)}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-[11px] text-[#FF8C00] hover:text-[#FFA500] hover:underline cursor-pointer truncate block"
                                                            title={item.payoutTxFull}
                                                        >
                                                            {item.payoutTx}
                                                        </a>
                                                    )}
                                                </div>
                                                <div>
                                                    <div className="text-[10px] font-semibold text-white mb-0.5">Roll</div>
                                                    <div className="text-[11px] text-white">{item.roll}</div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Desktop Layout - Responsive */}
                                    <div className="hidden lg:flex lg:flex-wrap xl:flex-nowrap gap-2 lg:gap-2 lg:items-center">
                                        {/* Result Section */}
                                        <div className="flex-shrink-0 w-full xl:w-auto xl:min-w-[120px] flex items-center justify-between xl:block border-b xl:border-b-0 pb-2 xl:pb-0 xl:pr-0">
                                            <div className="text-xs font-semibold text-white xl:text-center xl:mb-1">Result</div>
                                            <div className="flex items-center gap-2 xl:flex-col xl:gap-1">
                                                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0`}>
                                                    {item.result === 'win' ? (
                                                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                            <path d="M10 0C4.48 0 0 4.48 0 10C0 15.52 4.48 20 10 20C15.52 20 20 15.52 20 10C20 4.48 15.52 0 10 0ZM8 15L3 10L4.41 8.59L8 12.17L15.59 4.58L17 6L8 15Z" fill="#00FFA3" />
                                                        </svg>
                                                    ) : item.result === 'pending' ? (
                                                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                            <g>
                                                                <circle cx="10" cy="10" r="8" stroke="#00FFA3" strokeWidth="2" fill="none" strokeDasharray="12.566" strokeDashoffset="12.566">
                                                                    <animate attributeName="stroke-dasharray" values="0,12.566;6.283,6.283;0,12.566" dur="1.5s" repeatCount="indefinite" />
                                                                    <animate attributeName="stroke-dashoffset" values="0;-6.283;-12.566" dur="1.5s" repeatCount="indefinite" />
                                                                </circle>
                                                                <circle cx="10" cy="10" r="5" stroke="#00FFA3" strokeWidth="1.5" fill="none" opacity="0.5" strokeDasharray="7.854" strokeDashoffset="7.854">
                                                                    <animate attributeName="stroke-dasharray" values="0,7.854;3.927,3.927;0,7.854" dur="1.5s" repeatCount="indefinite" />
                                                                    <animate attributeName="stroke-dashoffset" values="0;-3.927;-7.854" dur="1.5s" repeatCount="indefinite" />
                                                                </circle>
                                                            </g>
                                                        </svg>
                                                    ) : (
                                                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                            <path d="M10 0C4.47 0 0 4.47 0 10C0 15.53 4.47 20 10 20C15.53 20 20 15.53 20 10C20 4.47 15.53 0 10 0ZM15 13.59L13.59 15L10 11.41L6.41 15L5 13.59L8.59 10L5 6.41L6.41 5L10 8.59L13.59 5L15 6.41L11.41 10L15 13.59Z" fill="#3C3C3C" />
                                                        </svg>
                                                    )}
                                                </div>
                                                <span className={`text-sm font-semibold capitalize ${item.result === 'win' ? 'text-[#FF8C00]' : item.result === 'pending' ? 'text-[#FF8C00]' : 'text-white/50'}`}>
                                                    {item.result}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Bet Amount & Payout */}
                                        <div className="flex-shrink-0 w-full xl:w-auto flex gap-2">
                                            <div className="flex-1 xl:flex-none xl:min-w-[140px] border border-[#FF8C00]/30 bg-black/50 rounded-md p-1.5 text-center">
                                                <div className="text-[10px] font-semibold text-white mb-0.5 whitespace-nowrap">Bet Amount</div>
                                                <div className="font-semibold text-[11px] leading-tight break-words text-[#FF8C00]">
                                                    {formatSOLShort(item.betAmount)} SOL
                                                </div>
                                                <div className="text-[9px] text-white/70 mt-0.5 break-words">{item.betUsd}</div>
                                            </div>
                                            <div className="flex-1 xl:flex-none xl:min-w-[140px] border border-[#FF8C00]/30 bg-black/50 rounded-md p-1.5 text-center">
                                                <div className="text-[10px] font-semibold text-white mb-0.5 whitespace-nowrap">Payout</div>
                                                <div className={`font-semibold text-[11px] leading-tight break-words ${item.result === 'win' ? 'text-[#FF8C00]' : 'text-white/50'}`}>
                                                    {formatSOLShort(item.payout)} SOL
                                                </div>
                                                <div className="text-[9px] text-white/70 mt-0.5 break-words">{item.payoutUsd}</div>
                                            </div>
                                        </div>

                                        {/* Details Grid - Responsive flex with even distribution */}
                                        <div className="flex-1 w-full xl:w-auto flex flex-nowrap justify-between xl:justify-start xl:gap-3 pt-2 xl:pt-0 border-t xl:border-t-0 border-[#FF8C00]/20 min-w-0">
                                            <div className="flex-1 text-center min-w-0">
                                                <div className="text-[10px] font-semibold text-white mb-0.5 whitespace-nowrap">Time</div>
                                                <div className="text-[11px] text-white break-words">{item.time}</div>
                                            </div>
                                            <div className="flex-1 text-center min-w-0">
                                                <div className="text-[10px] font-semibold text-white mb-0.5 whitespace-nowrap">Game ID</div>
                                                <a 
                                                    href={`/fair?id=${item.gameId}`}
                                                    className="text-[11px] text-[#FF8C00] hover:text-[#FFA500] hover:underline cursor-pointer break-words block"
                                                >
                                                    {item.gameId}
                                                </a>
                                            </div>
                                            <div className="flex-1 text-center min-w-0">
                                                <div className="text-[10px] font-semibold text-white mb-0.5 whitespace-nowrap">Deposit TX</div>
                                                <a 
                                                    href={getTxUrl(item.depositTxFull)}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-[11px] text-[#FF8C00] hover:text-[#FFA500] hover:underline cursor-pointer break-all block"
                                                    title={item.depositTxFull}
                                                >
                                                    {item.depositTx}
                                                </a>
                                            </div>
                                            <div className="flex-1 text-center min-w-0">
                                                <div className="text-[10px] font-semibold text-white mb-0.5 whitespace-nowrap">Payout TX</div>
                                                {item.payoutTx === 'N/A' ? (
                                                    <div className="text-[11px] text-white/50">N/A</div>
                                                ) : (
                                                    <a 
                                                        href={getTxUrl(item.payoutTxFull)}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-[11px] text-[#FF8C00] hover:text-[#FFA500] hover:underline cursor-pointer break-all block"
                                                        title={item.payoutTxFull}
                                                    >
                                                        {item.payoutTx}
                                                    </a>
                                                )}
                                            </div>
                                            <div className="flex-1 text-center min-w-0">
                                                <div className="text-[10px] font-semibold text-white mb-0.5 whitespace-nowrap">Bet</div>
                                                <div className="text-[11px] text-white break-words">{typeof item.bet === 'number' ? item.bet : 'N/A'}</div>
                                            </div>
                                            <div className="flex-1 text-center min-w-0">
                                                <div className="text-[10px] font-semibold text-white mb-0.5 whitespace-nowrap">Roll</div>
                                                <div className="text-[11px] text-white break-words">{item.roll}</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}

                            {/* Pagination Controls - Below table, right-aligned */}
                            {totalPages > 1 && (
                                <div className="mt-6 pb-4">
                                    <div className="flex justify-end items-center gap-2">
                                        {/* Mobile Pagination: <, input, > */}
                                        <div className="flex items-center gap-2 md:hidden">
                                            <button
                                                onClick={() => {
                                                    const newPage = Math.max(1, currentPage - 1);
                                                    setCurrentPage(newPage);
                                                    setMobilePageInput(newPage.toString());
                                                }}
                                                disabled={currentPage === 1 || loading}
                                                className={`px-3 py-2 rounded-lg font-semibold text-sm transition-colors ${
                                                    currentPage === 1 || loading
                                                        ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                                                        : 'bg-[#FF8C00] text-white hover:bg-[#FFA500]'
                                                }`}
                                            >
                                                &lt;
                                            </button>
                                            
                                            <input
                                                type="number"
                                                min="1"
                                                max={totalPages}
                                                value={mobilePageInput}
                                                onChange={(e) => {
                                                    const value = e.target.value;
                                                    setMobilePageInput(value);
                                                }}
                                                onBlur={(e) => {
                                                    const page = parseInt(e.target.value) || 1;
                                                    const validPage = Math.max(1, Math.min(totalPages, page));
                                                    setCurrentPage(validPage);
                                                    setMobilePageInput(validPage.toString());
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        const page = parseInt(mobilePageInput) || 1;
                                                        const validPage = Math.max(1, Math.min(totalPages, page));
                                                        setCurrentPage(validPage);
                                                        setMobilePageInput(validPage.toString());
                                                        e.target.blur();
                                                    }
                                                }}
                                                disabled={loading}
                                                className="w-16 px-2 py-2 rounded-lg font-semibold text-sm text-center bg-black/50 text-white border border-[#FF8C00] focus:outline-none focus:ring-2 focus:ring-[#FF8C00] disabled:opacity-50"
                                            />
                                            
                                            <button
                                                onClick={() => {
                                                    const newPage = Math.min(totalPages, currentPage + 1);
                                                    setCurrentPage(newPage);
                                                    setMobilePageInput(newPage.toString());
                                                }}
                                                disabled={currentPage === totalPages || loading}
                                                className={`px-3 py-2 rounded-lg font-semibold text-sm transition-colors ${
                                                    currentPage === totalPages || loading
                                                        ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                                                        : 'bg-[#FF8C00] text-white hover:bg-[#FFA500]'
                                                }`}
                                            >
                                                &gt;
                                            </button>
                                        </div>
                                        
                                        {/* Desktop Pagination: <, 1, 2, 3, 4, ..., end, > */}
                                        <div className="hidden md:flex items-center gap-1">
                                            {/* Previous Button */}
                                            <button
                                                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                                disabled={currentPage === 1 || loading}
                                                className={`px-3 py-2 rounded-lg font-semibold text-sm transition-colors ${
                                                    currentPage === 1 || loading
                                                        ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                                                        : 'bg-[#FF8C00] text-white hover:bg-[#FFA500]'
                                                }`}
                                            >
                                                &lt;
                                            </button>
                                            
                                            {/* First Page */}
                                            {currentPage > 3 && totalPages > 5 && (
                                                <>
                                                    <button
                                                        onClick={() => setCurrentPage(1)}
                                                        disabled={loading}
                                                        className={`w-10 h-10 rounded-lg font-semibold text-sm transition-colors ${
                                                            currentPage === 1
                                                                ? 'bg-[#FF8C00] text-white'
                                                                : 'bg-black/50 text-white/70 hover:bg-[#FF8C00]/30'
                                                        } ${loading ? 'cursor-not-allowed opacity-50' : ''}`}
                                                    >
                                                        1
                                                    </button>
                                                    {currentPage > 4 && (
                                                        <span className="text-white/70 px-1">...</span>
                                                    )}
                                                </>
                                            )}
                                            
                                            {/* Page Numbers around current page */}
                                            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                                let pageNum;
                                                if (totalPages <= 5) {
                                                    pageNum = i + 1;
                                                } else if (currentPage <= 3) {
                                                    pageNum = i + 1;
                                                } else if (currentPage >= totalPages - 2) {
                                                    pageNum = totalPages - 4 + i;
                                                } else {
                                                    pageNum = currentPage - 2 + i;
                                                }
                                                
                                                // Skip if already shown as first page
                                                if (currentPage > 3 && totalPages > 5 && pageNum === 1) {
                                                    return null;
                                                }
                                                
                                                return (
                                                    <button
                                                        key={pageNum}
                                                        onClick={() => setCurrentPage(pageNum)}
                                                        disabled={loading}
                                                        className={`w-10 h-10 rounded-lg font-semibold text-sm transition-colors ${
                                                            currentPage === pageNum
                                                                ? 'bg-[#FF8C00] text-white'
                                                                : 'bg-black/50 text-white/70 hover:bg-[#FF8C00]/30'
                                                        } ${loading ? 'cursor-not-allowed opacity-50' : ''}`}
                                                    >
                                                        {pageNum}
                                                    </button>
                                                );
                                            }).filter(Boolean)}
                                            
                                            {/* Last Page */}
                                            {currentPage < totalPages - 2 && totalPages > 5 && (
                                                <>
                                                    {currentPage < totalPages - 3 && (
                                                        <span className="text-white/70 px-1">...</span>
                                                    )}
                                                    <button
                                                        onClick={() => setCurrentPage(totalPages)}
                                                        disabled={loading}
                                                        className={`w-10 h-10 rounded-lg font-semibold text-sm transition-colors ${
                                                            currentPage === totalPages
                                                                ? 'bg-[#FF8C00] text-white'
                                                                : 'bg-black/50 text-white/70 hover:bg-[#FF8C00]/30'
                                                        } ${loading ? 'cursor-not-allowed opacity-50' : ''}`}
                                                    >
                                                        {totalPages}
                                                    </button>
                                                </>
                                            )}
                                            
                                            {/* Next Button */}
                                            <button
                                                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                                disabled={currentPage === totalPages || loading}
                                                className={`px-3 py-2 rounded-lg font-semibold text-sm transition-colors ${
                                                    currentPage === totalPages || loading
                                                        ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                                                        : 'bg-[#FF8C00] text-white hover:bg-[#FFA500]'
                                                }`}
                                            >
                                                &gt;
                                            </button>
                                        </div>
                                    </div>
                                    
                                    {/* Pagination Info (showing X to Y of Z) */}
                                    {totalItems > 0 && (
                                        <div className="text-center mt-4">
                                            <div className="text-white/70 text-sm">
                                                {(() => {
                                                    const start = ((currentPage - 1) * ITEMS_PER_PAGE) + 1;
                                                    const end = Math.min(currentPage * ITEMS_PER_PAGE, totalItems);
                                                    return `Showing ${start} to ${end} of ${totalItems} bets`;
                                                })()}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    ) : loading ? (
                        <div className="text-center py-8">
                            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[#FF8C00]"></div>
                            <p className="mt-2 text-white">Loading bet history...</p>
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
