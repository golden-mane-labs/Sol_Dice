"use client";
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  ChevronDown,
  Globe,
  ExternalLink,
  Activity,
  Trophy
} from 'lucide-react';
import Navbar from '@/components/navbar';
import { QRCode } from 'react-qrcode-logo';
import BettingHistory from '@/components/gameHistory';
import Footer from '@/components/footer';
import ClientOnly from '@/components/ClientOnly';
import { getAllWallets, getHouseInfo, getStats, getRecentBets, getSolPrice, getWebSocketUrl } from '@/utils/api';
import { useWebSocket } from '@/utils/websocket';

export default function App() {
  const LAMPORTS_PER_SOL = 1_000_000_000;
  
  // Mounted state to prevent hydration mismatches
  const [mounted, setMounted] = useState(false);
  
  // Logo image state for QR code (converted to data URL for mobile compatibility)
  const [logoDataUrl, setLogoDataUrl] = useState(null);
  
  // API Data State
  const [wallets, setWallets] = useState([]);
  const [houseInfo, setHouseInfo] = useState(null);
  const [selectedWallet, setSelectedWallet] = useState(null);
  const [walletAddress, setWalletAddress] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [totalBets, setTotalBets] = useState(null);
  const [recentBets, setRecentBets] = useState([]);
  
  // Multiplier state
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isDraggingMultiplier, setIsDraggingMultiplier] = useState(false);
  const multiplierProgressBarRef = useRef(null);

  // Bet amount state
  const [betAmount, setBetAmount] = useState(0.1);
  const [isDraggingBet, setIsDraggingBet] = useState(false);
  const [currency, setCurrency] = useState('SOL');
  const [betAmountInput, setBetAmountInput] = useState('');
  const betProgressBarRef = useRef(null);

  // Toast notification state
  const [toast, setToast] = useState({ show: false, message: '' });

  // Bet limits (will be updated from API and wallet-specific ranges)
  const [minBet, setMinBet] = useState(0.001);
  const [maxBet, setMaxBet] = useState(7.5);
  const [walletBetRanges, setWalletBetRanges] = useState({});
  
  // SOL/USD price state (fetched from API, updated via WebSocket)
  const [usdRate, setUsdRate] = useState(200.0);

  // Format multiplier for display (show 2 decimals when needed, integer when whole)
  const formatMultiplier = (mult) => {
    const num = parseFloat(mult);
    return num % 1 === 0 ? num.toString() : num.toFixed(2);
  };

  // Transform wallets to match UI structure (sorted descending: 1000x, 100x, 50x, etc.)
  const multipliers = [...wallets]
    .sort((a, b) => b.multiplier - a.multiplier)
    .map(w => ({
      label: `${formatMultiplier(w.multiplier)}x`,
      chance: `${w.chance.toFixed(2)}%`,
      multiplier: w.multiplier,
      address: w.address
    }));

  // Multiplier functions
  const getMultiplierProgressPosition = () => {
    return (selectedIndex / (multipliers.length - 1)) * 100;
  };

  const updateMultiplierPositionFromMouse = (clientX) => {
    if (!multiplierProgressBarRef.current) return;
    const rect = multiplierProgressBarRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
    const index = Math.round((percentage / 100) * (multipliers.length - 1));
    setSelectedIndex(index);
  };

  const handleMultiplierMouseDown = (e) => {
    setIsDraggingMultiplier(true);
    updateMultiplierPositionFromMouse(e.clientX);
  };

  const handleMultiplierMouseMove = (e) => {
    if (isDraggingMultiplier) {
      updateMultiplierPositionFromMouse(e.clientX);
    }
  };

  const handleMultiplierMouseUp = () => {
    setIsDraggingMultiplier(false);
  };

  // Bet amount functions
  const formatSOL = (amount) => {
    return parseFloat(parseFloat(amount).toFixed(4)).toString();
  };

  const getBetProgressPosition = () => {
    // Use linear scale for smaller ranges (maxBet/minBet <= 100), logarithmic for larger ranges
    const rangeRatio = maxBet / minBet;
    const useLinearScale = rangeRatio <= 100;
    
    if (useLinearScale) {
      // Linear scale: simple percentage calculation
      return ((betAmount - minBet) / (maxBet - minBet)) * 100;
    } else {
      // Logarithmic scale: better for wide ranges
      const minLog = Math.log(minBet);
      const maxLog = Math.log(maxBet);
      const currentLog = Math.log(betAmount);
      return ((currentLog - minLog) / (maxLog - minLog)) * 100;
    }
  };

  // Use refs to cache values during drag to avoid re-renders
  const betRectRef = useRef(null);
  const animationFrameRef = useRef(null);
  const pendingBetAmountRef = useRef(null);

  const positionToBetAmount = useCallback((percentage) => {
    // Use linear scale for smaller ranges (maxBet/minBet <= 100), logarithmic for larger ranges
    const rangeRatio = maxBet / minBet;
    const useLinearScale = rangeRatio <= 100;
    
    if (useLinearScale) {
      // Linear scale: simple interpolation
      return minBet + (percentage / 100) * (maxBet - minBet);
    } else {
      // Logarithmic scale: better for wide ranges
      const minLog = Math.log(minBet);
      const maxLog = Math.log(maxBet);
      const currentLog = minLog + (percentage / 100) * (maxLog - minLog);
      return Math.exp(currentLog);
    }
  }, [minBet, maxBet]);

  const handleBetChange = useCallback((newAmount) => {
    const clampedAmount = Math.max(minBet, Math.min(maxBet, newAmount));
    setBetAmount(clampedAmount);
  }, [minBet, maxBet]);

  // Optimized update function using requestAnimationFrame
  const updateBetAmountSmooth = useCallback((newAmount) => {
    pendingBetAmountRef.current = newAmount;
    
    if (animationFrameRef.current === null) {
      animationFrameRef.current = requestAnimationFrame(() => {
        if (pendingBetAmountRef.current !== null) {
          const clampedAmount = Math.max(minBet, Math.min(maxBet, pendingBetAmountRef.current));
          setBetAmount(clampedAmount);
          pendingBetAmountRef.current = null;
        }
        animationFrameRef.current = null;
      });
    }
  }, [minBet, maxBet]);

  const updateBetPositionFromMouse = useCallback((clientX) => {
    if (!betProgressBarRef.current) return;
    
    // Cache rect during drag for better performance
    if (!betRectRef.current) {
      betRectRef.current = betProgressBarRef.current.getBoundingClientRect();
    }
    
    const rect = betRectRef.current;
    const x = clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
    const newAmount = positionToBetAmount(percentage);
    updateBetAmountSmooth(newAmount);
  }, [positionToBetAmount, updateBetAmountSmooth]);

  const updateBetPositionFromTouch = useCallback((touch) => {
    if (!betProgressBarRef.current) return;
    
    // Cache rect during drag for better performance
    if (!betRectRef.current) {
      betRectRef.current = betProgressBarRef.current.getBoundingClientRect();
    }
    
    const rect = betRectRef.current;
    const x = touch.clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
    const newAmount = positionToBetAmount(percentage);
    updateBetAmountSmooth(newAmount);
  }, [positionToBetAmount, updateBetAmountSmooth]);

  const handleBetMouseDown = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    betRectRef.current = null; // Reset cache
    setIsDraggingBet(true);
    updateBetPositionFromMouse(e.clientX);
  }, [updateBetPositionFromMouse]);

  const handleBetMouseMove = useCallback((e) => {
    if (isDraggingBet) {
      e.preventDefault();
      updateBetPositionFromMouse(e.clientX);
    }
  }, [isDraggingBet, updateBetPositionFromMouse]);

  const handleBetMouseUp = useCallback((e) => {
    e.preventDefault();
    setIsDraggingBet(false);
    betRectRef.current = null; // Clear cache
    // Flush any pending updates
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (pendingBetAmountRef.current !== null) {
      const clampedAmount = Math.max(minBet, Math.min(maxBet, pendingBetAmountRef.current));
      setBetAmount(clampedAmount);
      pendingBetAmountRef.current = null;
    }
  }, [minBet, maxBet]);

  const handleBetTouchStart = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    betRectRef.current = null; // Reset cache
    setIsDraggingBet(true);
    if (e.touches && e.touches.length > 0) {
      updateBetPositionFromTouch(e.touches[0]);
    }
  }, [updateBetPositionFromTouch]);

  const handleBetTouchMove = useCallback((e) => {
    if (isDraggingBet && e.touches && e.touches.length > 0) {
      e.preventDefault();
      e.stopPropagation();
      updateBetPositionFromTouch(e.touches[0]);
    }
  }, [isDraggingBet, updateBetPositionFromTouch]);

  const handleBetTouchEnd = useCallback((e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setIsDraggingBet(false);
    betRectRef.current = null; // Clear cache
    // Flush any pending updates
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (pendingBetAmountRef.current !== null) {
      const clampedAmount = Math.max(minBet, Math.min(maxBet, pendingBetAmountRef.current));
      setBetAmount(clampedAmount);
      pendingBetAmountRef.current = null;
    }
  }, [minBet, maxBet]);

  const calculateRollLowerThan = () => {
    // Calculate win threshold based on selected multiplier's chance
    // Formula: threshold = (chance / 100) * 65536
    // Example: 50% chance -> 32768, 10% chance -> 6553
    if (selectedWallet && selectedWallet.chance) {
      const threshold = Math.floor((selectedWallet.chance / 100.0) * 65536);
      return threshold;
    }
    return 0;
  };

  const getDisplayValue = () => {
    if (currency === 'USD') {
      return (betAmount * usdRate).toFixed(2);
    }
    return formatSOL(betAmount);
  };

  // Handle bet amount input change
  const handleBetAmountInputChange = (e) => {
    const value = e.target.value;
    setBetAmountInput(value);
    
    // Allow empty input for typing
    if (value === '' || value === '.') {
      return;
    }
    
    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue < 0) {
      return;
    }
    
    let newBetAmount;
    if (currency === 'USD') {
      // Convert USD to SOL
      newBetAmount = numValue / usdRate;
    } else {
      // Already in SOL
      newBetAmount = numValue;
    }
    
    // Clamp to min/max
    const clamped = Math.max(minBet, Math.min(maxBet, newBetAmount));
    setBetAmount(clamped);
    
    // Update input to show clamped value in current currency
    if (currency === 'USD') {
      setBetAmountInput((clamped * usdRate).toFixed(2));
    } else {
      setBetAmountInput(formatSOL(clamped));
    }
  };

  useEffect(() => {
    if (isDraggingMultiplier) {
      document.addEventListener('mousemove', handleMultiplierMouseMove);
      document.addEventListener('mouseup', handleMultiplierMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMultiplierMouseMove);
        document.removeEventListener('mouseup', handleMultiplierMouseUp);
      };
    }
  }, [isDraggingMultiplier, selectedIndex]);

  useEffect(() => {
    if (isDraggingBet) {
      document.addEventListener('mousemove', handleBetMouseMove, { passive: false });
      document.addEventListener('mouseup', handleBetMouseUp, { passive: false });
      document.addEventListener('touchmove', handleBetTouchMove, { passive: false });
      document.addEventListener('touchend', handleBetTouchEnd, { passive: false });
      document.addEventListener('touchcancel', handleBetTouchEnd, { passive: false });
      
      return () => {
        document.removeEventListener('mousemove', handleBetMouseMove);
        document.removeEventListener('mouseup', handleBetMouseUp);
        document.removeEventListener('touchmove', handleBetTouchMove);
        document.removeEventListener('touchend', handleBetTouchEnd);
        document.removeEventListener('touchcancel', handleBetTouchEnd);
        
        // Cleanup animation frame on unmount
        if (animationFrameRef.current !== null) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
      };
    }
  }, [isDraggingBet, handleBetMouseMove, handleBetMouseUp, handleBetTouchMove, handleBetTouchEnd]);

  // Format bet amount from lamports to SOL (wrapped in useCallback for stable reference)
  const formatBetAmount = useCallback((lamports) => {
    const sol = lamports / LAMPORTS_PER_SOL;
    // Limit to 6 decimal places precision and remove trailing zeros
    return parseFloat(parseFloat(sol).toFixed(4)).toString();
  }, []); // No dependencies - pure function

  // Transform bet data for display (wrapped in useCallback for stable reference)
  const transformBetForDisplay = useCallback((bet) => {
    try {
      const MAX_ROLL = 65535;
      // Calculate win threshold: max_roll * (chance / 100)
      // Use win_chance from bet, or calculate from multiplier as fallback
      const winChance = bet.win_chance || (bet.target_multiplier ? (1 / bet.target_multiplier * 100) : 0);
      const winThreshold = Math.floor(MAX_ROLL * (winChance / 100));
      
      // Get bet ID for proper duplicate detection
      const betId = bet.bet_id || bet.bet_number?.toString() || 'unknown';
      const gameId = bet.bet_number || (bet.bet_id ? bet.bet_id.slice(-8) : 'N/A');
      
      return {
        id: betId, // Bet ID for duplicate detection
        gameId: gameId, // Game ID for display
        result: bet.is_win !== undefined && bet.is_win !== null ? (bet.is_win ? 'win' : 'lose') : 'pending',
        betAmount: formatBetAmount(bet.bet_amount || 0),
        betAmountSat: bet.bet_amount || 0,
        payoutAmount: bet.is_win ? formatBetAmount(bet.payout_amount || 0) : '0.0000',
        payoutAmountSat: bet.is_win ? (bet.payout_amount || 0) : 0,
        bet: winThreshold, // Win threshold: max_roll * chance
        roll: bet.roll_result !== undefined && bet.roll_result !== null ? bet.roll_result : 'N/A',
        status: bet.status || 'pending' // Include status for tracking
      };
    } catch (error) {
      console.error('[Main Page] Error transforming bet:', error, bet);
      return null;
    }
  }, [formatBetAmount]); // formatBetAmount is stable, but include it for completeness

  // Function to fetch stats and recent bets
  const fetchStatsAndRecentBets = useCallback(async () => {
    try {
      // Fetch stats (total bets count)
      const statsData = await getStats();
      if (statsData && statsData.total_bets !== undefined && statsData.total_bets !== null) {
        setTotalBets(statsData.total_bets);
        console.log('[Main Page] Updated total bets:', statsData.total_bets);
      }
    } catch (err) {
      console.warn('[Main Page] Failed to fetch stats:', err);
    }
    
    // Fetch recent bets
    try {
      const recentBetsData = await getRecentBets(3);
      if (recentBetsData && recentBetsData.bets) {
        const formatted = recentBetsData.bets.map(bet => transformBetForDisplay(bet));
        setRecentBets(formatted);
        console.log('[Main Page] Updated recent bets:', formatted.length);
      }
    } catch (err) {
      console.warn('[Main Page] Failed to fetch recent bets:', err);
    }
  }, [transformBetForDisplay]);

  // Set mounted state on client
  useEffect(() => {
    setMounted(true);
  }, []);

  // Poll stats and recent bets every 10 seconds
  useEffect(() => {
    // Set up polling interval
    const intervalId = setInterval(() => {
      console.log('[Main Page] Polling stats and recent bets...');
      fetchStatsAndRecentBets();
    }, 10000); // 10 seconds

    // Cleanup interval on unmount
    return () => {
      clearInterval(intervalId);
      console.log('[Main Page] Stopped polling stats and recent bets');
    };
  }, [fetchStatsAndRecentBets]);

  // Fetch data on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Fetch SOL/USD price first
        try {
          const solPrice = await getSolPrice();
          setUsdRate(solPrice);
          console.log(`[PRICE] SOL/USD: $${solPrice.toLocaleString()}`);
        } catch (priceError) {
          console.error('Failed to fetch SOL price, using fallback:', priceError);
          setUsdRate(98000.0); // Realistic fallback
        }
        
        // Fetch house info (bet limits)
        const houseData = await getHouseInfo();
        setHouseInfo(houseData);
        
        // Convert lamports to SOL
        const minBetSOL = houseData.min_bet / LAMPORTS_PER_SOL;
        const maxBetSOL = houseData.max_bet / LAMPORTS_PER_SOL;
        setMinBet(minBetSOL);
        setMaxBet(maxBetSOL);
        
        // Set initial bet amount to middle of range
        const initialBet = (minBetSOL + maxBetSOL) / 2;
        const clampedInitialBet = Math.max(minBetSOL, Math.min(maxBetSOL, initialBet));
        setBetAmount(clampedInitialBet);
        
        // Initialize input value (will be updated when usdRate is set)
        if (currency === 'USD') {
          // Use current usdRate (may be fallback initially, will update when price is fetched)
          setBetAmountInput((clampedInitialBet * usdRate).toFixed(2));
        } else {
          setBetAmountInput(formatSOL(clampedInitialBet));
        }
        
        // Fetch wallets
        const walletsData = await getAllWallets();
        setWallets(walletsData);
        
        // Store bet ranges per multiplier
        const ranges = {};
        walletsData.forEach(wallet => {
          ranges[wallet.multiplier] = {
            min: (wallet.min_bet_sats ?? wallet.min_bet_lamports) ? (wallet.min_bet_sats ?? wallet.min_bet_lamports) / LAMPORTS_PER_SOL : minBetSOL,
            max: (wallet.max_bet_sats ?? wallet.max_bet_lamports) ? (wallet.max_bet_sats ?? wallet.max_bet_lamports) / LAMPORTS_PER_SOL : maxBetSOL
          };
        });
        setWalletBetRanges(ranges);
        
        // Set default selected wallet
        if (walletsData.length > 0) {
          const sortedWallets = [...walletsData].sort((a, b) => b.multiplier - a.multiplier);
          const defaultIndex = Math.min(4, sortedWallets.length - 1);
          setSelectedIndex(defaultIndex);
          if (sortedWallets[defaultIndex]) {
            const defaultWallet = sortedWallets[defaultIndex];
            setSelectedWallet(defaultWallet);
            setWalletAddress(defaultWallet.address);
            
            // Set bet limits for default wallet
            const defaultRange = ranges[defaultWallet.multiplier] || { min: minBetSOL, max: maxBetSOL };
            setMinBet(defaultRange.min);
            setMaxBet(defaultRange.max);
            
            // Clamp bet amount to new range
            const clampedBet = Math.max(defaultRange.min, Math.min(defaultRange.max, betAmount));
            setBetAmount(clampedBet);
          }
        }
        
        // Fetch initial stats and recent bets
        await fetchStatsAndRecentBets();
        
      } catch (err) {
        console.error('Error fetching data:', err);
        setError(err.response?.data?.detail || err.message || 'Failed to load game data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    
    // Convert SVG logo to data URL for better mobile Safari compatibility
    const convertSvgToDataUrl = async () => {
      try {
        const response = await fetch('/assets/dice.svg');
        if (!response.ok) {
          throw new Error('Failed to fetch SVG');
        }
        const svgText = await response.text();
        
        // Encode SVG to base64 data URL (works better on mobile Safari)
        const base64Svg = btoa(unescape(encodeURIComponent(svgText)));
        const svgDataUrl = `data:image/svg+xml;base64,${base64Svg}`;
        
        // For better mobile Safari support, convert to PNG via canvas
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = 200;
            canvas.height = 200;
            const ctx = canvas.getContext('2d');
            
            // Draw white background for better QR code contrast
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // Draw the SVG image
            ctx.drawImage(img, 0, 0, 200, 200);
            
            // Convert to PNG data URL
            const pngDataUrl = canvas.toDataURL('image/png');
            setLogoDataUrl(pngDataUrl);
          } catch (canvasError) {
            // Fallback to SVG data URL if canvas fails
            console.warn('Canvas conversion failed, using SVG data URL:', canvasError);
            setLogoDataUrl(svgDataUrl);
          }
        };
        
        img.onerror = () => {
          // Fallback to SVG data URL
          setLogoDataUrl(svgDataUrl);
        };
        
        img.src = svgDataUrl;
      } catch (error) {
        console.error('Error converting SVG to data URL:', error);
        // Fallback to SVG path
        setLogoDataUrl('/assets/dice.svg');
      }
    };
    
    convertSvgToDataUrl();
  }, []);

  // Update input value when betAmount, currency, or usdRate changes
  useEffect(() => {
    if (currency === 'USD') {
      setBetAmountInput((betAmount * usdRate).toFixed(2));
    } else {
      setBetAmountInput(formatSOL(betAmount));
    }
  }, [betAmount, currency, usdRate]);

  // Update wallet address and bet limits when selected index changes
  useEffect(() => {
    if (wallets.length > 0 && selectedIndex < wallets.length) {
      const sortedWallets = [...wallets].sort((a, b) => b.multiplier - a.multiplier);
      if (selectedIndex < sortedWallets.length) {
        const wallet = sortedWallets[selectedIndex];
        setSelectedWallet(wallet);
        setWalletAddress(wallet.address);
        
        // Update bet limits for selected wallet
        // Use wallet-specific range if available, otherwise calculate from wallet data or use global defaults
        const range = walletBetRanges[wallet.multiplier];
        if (range) {
          setMinBet(range.min);
          setMaxBet(range.max);
          
          // Clamp current bet amount to new range
          setBetAmount(prev => Math.max(range.min, Math.min(range.max, prev)));
        } else if (wallet.min_bet_sats || wallet.max_bet_sats || wallet.min_bet_lamports || wallet.max_bet_lamports) {
          const minLamports = wallet.min_bet_lamports ?? wallet.min_bet_sats;
          const maxLamports = wallet.max_bet_lamports ?? wallet.max_bet_sats;
          const minBetSOL = minLamports ? minLamports / LAMPORTS_PER_SOL : minBet;
          const maxBetSOL = maxLamports ? maxLamports / LAMPORTS_PER_SOL : maxBet;
          setMinBet(minBetSOL);
          setMaxBet(maxBetSOL);
          setBetAmount(prev => Math.max(minBetSOL, Math.min(maxBetSOL, prev)));
        }
      }
    }
  }, [selectedIndex, wallets, walletBetRanges]);

  const [activeTab, setActiveTab] = useState('all');
  const [wsConnected, setWsConnected] = useState(false);

  // Combined WebSocket message handler for both price updates and bet results
  const handleWebSocketMessage = useCallback((message) => {
    console.log('[Main Page] Received WebSocket message:', message);
    
    // Handle SOL price updates
    if (message.type === 'sol_price_update' || message.type === 'btc_price_update') {
      const newPrice = message.data?.sol_price_usd ?? message.data?.btc_price_usd;
      if (newPrice && newPrice > 0) {
        setUsdRate(newPrice);
        console.log(`[PRICE] Updated via WebSocket: $${newPrice.toLocaleString()}`);
      }
      return;
    }
    
    // Handle bet result messages
    if (message.type === 'new_bet' && message.bet) {
      console.log('[Main Page] Processing new bet:', message.bet);
      
      // Update total bets count if provided in stats
      if (message.stats && message.stats.total_bets !== undefined && message.stats.total_bets !== null) {
        setTotalBets(message.stats.total_bets);
        console.log(`[Main Page] Updated total bets via WebSocket: ${message.stats.total_bets}`);
      }
      
      try {
        const transformed = transformBetForDisplay(message.bet);
        console.log('[Main Page] Transformed bet:', transformed);
        
        if (!transformed) {
          console.warn('[Main Page] Failed to transform bet, skipping');
          return;
        }
        
        setRecentBets(prev => {
          // Check if bet already exists by ID (not win threshold)
          // Use bet.id (from bet_id or bet_number) for proper duplicate detection
          const betId = transformed.id || transformed.gameId;
          const exists = prev.some(bet => {
            // Compare by ID or gameId
            return bet.id === betId || bet.gameId === transformed.gameId;
          });
          
          if (exists) {
            console.log('[Main Page] Bet already exists, skipping:', betId);
            return prev;
          }
          
          console.log('[Main Page] Adding new bet to recent bets:', betId);
          // Add new bet at the beginning and keep only last 3
          return [transformed, ...prev].slice(0, 3);
        });
      } catch (error) {
        console.error('[Main Page] Error transforming bet:', error, message.bet);
      }
    }
  }, [transformBetForDisplay]); // Include transformBetForDisplay in dependencies

  // WebSocket error handler
  const handleWebSocketError = useCallback((error) => {
    console.error('[WebSocket] Error:', error);
  }, []);

  // WebSocket connect handler
  const handleWebSocketConnect = useCallback(() => {
    console.log('[WebSocket] Connected to bet updates');
    setWsConnected(true);
  }, []);

  // Connect to WebSocket for real-time bet updates and price updates
  const wsUrl = getWebSocketUrl();
  console.log('[Main Page] WebSocket URL:', wsUrl);
  const { isConnected } = useWebSocket(
    wsUrl,
    handleWebSocketMessage,  // Combined handler for both bet and price updates
    handleWebSocketError,
    handleWebSocketConnect
  );

  // Update connection status
  useEffect(() => {
    setWsConnected(isConnected);
  }, [isConnected]);

  // Prevent hydration mismatch by showing loading state until mounted
  if (!mounted) {
    return (
      <div className="min-h-screen bg-black bg-cover bg-center bg-no-repeat flex items-center justify-center" suppressHydrationWarning>
        <div className="text-center" suppressHydrationWarning>
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-white mb-4" suppressHydrationWarning></div>
          <p className="text-white text-lg" suppressHydrationWarning>Loading game data...</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black bg-cover bg-center bg-no-repeat flex items-center justify-center" suppressHydrationWarning>
        <div className="text-center" suppressHydrationWarning>
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-white mb-4" suppressHydrationWarning></div>
          <p className="text-white text-lg" suppressHydrationWarning>Loading game data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-black bg-cover bg-center bg-no-repeat flex items-center justify-center" suppressHydrationWarning>
        <div className="text-center max-w-md" suppressHydrationWarning>
          <div className="text-red-400 text-xl mb-4">⚠️ Error Loading Data</div>
          <p className="text-white mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-[#222] text-white rounded-lg hover:bg-[#333] transition"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (wallets.length === 0) {
    return (
      <div className="min-h-screen bg-black bg-cover bg-center bg-no-repeat flex items-center justify-center" suppressHydrationWarning>
        <div className="text-center" suppressHydrationWarning>
          <p className="text-white text-lg">No wallets available</p>
          <p className="text-white text-sm mt-2">Please configure wallets in admin panel</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Toast Notification - Outside ClientOnly for better visibility */}
      {toast.show && (
        <div 
          className="fixed bottom-4 left-1/2 z-[9999] pointer-events-none"
          style={{
            transform: 'translateX(-50%)',
            animation: 'fadeInUp 0.3s ease-out'
          }}
        >
          <div className="bg-[#FF8C00] text-white px-6 py-3 rounded-lg shadow-2xl flex items-center gap-2 pointer-events-auto">
            <span className="text-lg">✓</span>
            <span className="font-medium">{toast.message}</span>
          </div>
        </div>
      )}

    <ClientOnly>
      <div suppressHydrationWarning>
        <Navbar />

        <div className="bg-black bg-cover bg-center bg-no-repeat" suppressHydrationWarning>
        <div className="pt-4 pb-20 max-w-[1250px] mx-auto w-full z-20 px-4" suppressHydrationWarning>
          <div className='rounded-[5px] bg-[rgba(0,0,0,0.80)] p-3 mb-5' suppressHydrationWarning>
            <div className="text-center mb-4" suppressHydrationWarning>
              <p className="text-[#FFF] font-inter md:text-[28px] text-xl tracking-[0.0444em]">
                Select Your Odds &amp; Win Multiplier
              </p>
            </div>
            <div className='hidden md:block'>


              <div className="flex justify-between items-center bg-black/50 backdrop-blur-sm rounded-lg p-3 mb-4 gap-2 flex-wrap border border-[#FF8C00]/20">
                {multipliers.map((mult, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedIndex(i)}
                    className={`flex flex-col items-center justify-center px-3 py-2 rounded min-w-[80px] transition-all ${
                      selectedIndex === i 
                        ? 'text-white opacity-40' 
                        : 'hover:bg-[#FF8C00]/30 text-white'
                    }`}
                    style={{
                      background: selectedIndex === i 
                        ? 'linear-gradient(135deg, #00FFA3 0%, #9945FF 50%, #DC1FFF 100%)'
                        : 'transparent',
                      boxShadow: 'none'
                    }}
                  >
                    <p className="text-xs font-medium mb-1">Multiplier</p>
                    <p className="text-xl font-bold">{mult.label}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="relative mb-4 hidden md:block">
              <div
                ref={multiplierProgressBarRef}
                onMouseDown={handleMultiplierMouseDown}
                className="relative rounded border border-[#FF8C00]/30 bg-black/50 shadow-inner w-full h-5 overflow-hidden cursor-pointer"
              >
                <div
                  className="absolute top-0 left-0 h-full rounded-l transition-all duration-150"
                  style={{
                    width: `${getMultiplierProgressPosition()}%`,
                    background: 'linear-gradient(90deg, #00FFA3 0%, #9945FF 50%, #DC1FFF 100%)'
                  }}
                />
                <div
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 transition-all duration-150"
                  style={{ left: `${getMultiplierProgressPosition()}%` }}
                >
                  <div className="w-9 h-7 bg-[#FF8C00] rounded shadow-lg border border-[#FFA500] flex items-center justify-center gap-0.5 cursor-grab active:cursor-grabbing">
                    <div className="w-px h-4 bg-white/50"></div>
                    <div className="w-px h-4 bg-white/50"></div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap justify-center md:flex md:justify-between md:items-center gap-1 md:gap-1 max-w-full md:justify-between">
              {multipliers.map((mult, i) => (
                <div key={i} className="flex flex-col items-center md:w-auto" style={{ width: '64px', flexShrink: 0 }}>
                  <button
                    onClick={() => setSelectedIndex(i)}
                    className={`flex flex-col items-center justify-center w-16 md:w-20 px-1 py-1 rounded-full text-white font-medium text-xs md:text-sm transition-all ${
                      selectedIndex === i 
                        ? 'opacity-40' 
                        : ''
                    }`}
                    style={{
                      background: selectedIndex === i 
                        ? 'linear-gradient(135deg, #00FFA3 0%, #9945FF 50%, #DC1FFF 100%)'
                        : 'linear-gradient(135deg, #00FFA3 0%, #9945FF 50%, #DC1FFF 100%)',
                      boxShadow: 'none'
                    }}
                  >
                    <div className="text-[10px] md:text-xs opacity-90">Chance</div>
                    <span className="text-[10px] md:text-xs font-medium">{mult.chance}</span>
                  </button>
                  <span className={`text-[10px] mt-1 md:hidden text-center ${
                    selectedIndex === i ? 'text-[#FF8C00] font-semibold' : 'text-white opacity-75'
                  }`}>{mult.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Main Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_320px] gap-4">
            {/* Left Panel — Bet Amount */}
            <div className="rounded-[5px] bg-[rgba(0,0,0,0.20)] p-3">
              <div className="pb-3 text-center">
                <p className="text-[#FFF] font-inter text-[23px] tracking-[0.0444em]">Select Bet Amount</p>
              </div>

              <div className="pb-3">
                <div className="flex py-2 px-2 justify-center items-center rounded-[5px] bg-black/50 w-full border border-[#FF8C00]/20">
                  <input
                    type="text"
                    value={betAmountInput}
                    onChange={handleBetAmountInputChange}
                    onBlur={() => {
                      // Ensure input is formatted correctly on blur
                      if (currency === 'USD') {
                        setBetAmountInput((betAmount * usdRate).toFixed(2));
                      } else {
                        setBetAmountInput(formatSOL(betAmount));
                      }
                    }}
                    className="bg-transparent border-none outline-none text-[#FFF] font-arial text-lg flex-1 text-center"
                    style={{ width: 'auto', minWidth: '60px' }}
                    placeholder="0.00"
                  />
                  <div className="relative">
                    <div className="flex rounded-md overflow-hidden" style={{ background: '#333' }}>
                      <button
                        onClick={() => setCurrency('SOL')}
                        className="px-3 py-2 text-xs font-medium text-white transition-all"
                        style={{
                          background: currency === 'SOL' ? '#9945FF' : 'transparent'
                        }}
                      >
                        SOL
                      </button>
                      <button
                        onClick={() => setCurrency('USD')}
                        className="px-3 py-2 text-xs font-medium text-white transition-all"
                        style={{
                          background: currency === 'USD' ? '#9945FF' : 'transparent'
                        }}
                      >
                        USD
                      </button>
                    </div>
                  </div>
                </div>
                <div className="text-center pt-1.5">
                  <p className="text-[#FFF] font-inter text-[15px] leading-6">
                    {currency === 'SOL' ? `$${(betAmount * usdRate).toFixed(2)} USD` : `${formatSOL(betAmount)} SOL`}
                  </p>
                </div>
              </div>

              {/* Bet slider */}
              <div className="pb-2 relative">
                <div
                  ref={betProgressBarRef}
                  onMouseDown={handleBetMouseDown}
                  onTouchStart={handleBetTouchStart}
                  className="relative flex flex-col justify-center items-start rounded border border-[#FF8C00]/30 bg-black/50 shadow-inner w-full h-[18px] cursor-pointer overflow-hidden touch-none select-none"
                >
                  <div
                    className={`absolute top-0 left-0 h-full bg-[#FF8C00] ${isDraggingBet ? '' : 'transition-all duration-150'}`}
                    style={{ width: `${getBetProgressPosition()}%` }}
                  />
                  <div
                    className={`absolute top-0 ${isDraggingBet ? '' : 'transition-all duration-150'}`}
                    style={{ left: `${getBetProgressPosition()}%`, transform: 'translateX(-50%)' }}
                  >
                    <div 
                      className="shrink-0 shadow-[0_0_1px_1px_#9945FF_inset] w-[34px] h-7 relative cursor-grab active:cursor-grabbing bg-[#FF8C00] border border-[#FFA500]"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        handleBetMouseDown(e);
                      }}
                      onTouchStart={(e) => {
                        e.stopPropagation();
                        handleBetTouchStart(e);
                      }}
                    >
                      <div className="bg-white/50 w-px h-3.5 absolute left-[15px] top-[7px]"></div>
                      <div className="bg-white/50 w-px h-3.5 absolute left-[18px] top-[7px]"></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Min / 1/2 / x2 / Max buttons */}
              <div className="pt-4">
                <div className="flex justify-between items-center rounded-[5px] bg-black/50 w-full text-white font-inter text-[15px] border border-[#FF8C00]/20">
                  <button
                    onClick={() => handleBetChange(minBet)}
                    className="p-2 rounded-[5px] w-[25%] text-center hover:bg-[#FF8C00]/30 transition"
                  >
                    Min
                  </button>
                  <button
                    onClick={() => handleBetChange(betAmount / 2)}
                    className="py-2 px-2 border-x border-[#FF8C00]/30 w-[25%] text-center text-sm hover:bg-[#FF8C00]/30 transition"
                  >
                    1/2
                  </button>
                  <button
                    onClick={() => handleBetChange(betAmount * 2)}
                    className="py-2 px-2 border-r border-[#FF8C00]/30 w-[25%] text-center hover:bg-[#FF8C00]/30 transition"
                  >
                    x2
                  </button>
                  <button
                    onClick={() => handleBetChange(maxBet)}
                    className="p-2 rounded-[5px] w-[25%] text-center hover:bg-[#FF8C00]/30 transition"
                  >
                    Max
                  </button>
                </div>
              </div>

              {/* Game Info */}
              <div className="mt-4">
                <p className="text-[#FFF] font-inter text-[23px] tracking-[0.0437em] text-center mb-2">Game Info</p>
                <div className="grid grid-cols-2 gap-1.5 mb-1.5">
                  <div className="py-1.5 px-2 bg-black/50 rounded-[5px] text-center border border-[#FF8C00]/20">
                    <p className="text-[#FFF] font-inter text-[11px] leading-3">Roll Lower than:</p>
                    <p className="text-[#FFF] font-inter text-[11px] leading-3">{calculateRollLowerThan()}</p>
                  </div>
                  <div className="py-1.5 px-2 bg-black/50 rounded-[5px] text-center border border-[#FF8C00]/20">
                    <p className="text-[#FFF] font-inter text-[11px] leading-3">Maximum Roll</p>
                    <p className="text-[#FFF] font-inter text-[11px] leading-3">65535</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <div className="py-1.5 px-2 bg-black/50 rounded-[5px] text-center border border-[#FF8C00]/20">
                    <p className="text-[#FFF] font-inter text-[11px] leading-3">Min Bet</p>
                    <p className="text-[#FF8C00] font-inter text-[11px] leading-3">{minBet.toFixed(4)} SOL</p>
                  </div>
                  <div className="py-1.5 px-2 bg-black/50 rounded-[5px] text-center border border-[#FF8C00]/20">
                    <p className="text-[#FFF] font-inter text-[11px] leading-3">Max Bet</p>
                    <p className="text-[#FF8C00] font-inter text-[11px] leading-3">{maxBet.toFixed(4)} SOL</p>
                  </div>
                </div>
              </div>
            </div>
            <div className='hidden md:block'>
              <div className="flex flex-col gap-4">

                <div className=" p-3">
                  <p className="text-[#FFF] font-inter text-[23px] tracking-[0.0444em] text-center mb-3">Total Bets</p>
                  <div className="flex justify-center items-start min-h-[56px]">
                    {totalBets !== null ? (
                      totalBets.toLocaleString().split('').map((char, i) => (
                        <React.Fragment key={i}>
                          {char === "," ? (
                            <div className="flex items-end px-0.5">
                              <p className="text-[#222] font-inter text-[40px] leading-8">,</p>
                            </div>
                          ) : (
                            <div className="p-0.5">
                              <div className="p-2 bg-black/50 rounded-[5px] shadow-[0_1px_3px_0_rgba(255,140,0,0.30)] w-10 flex justify-center border border-[#FF8C00]/20">
                                <p className="text-[#FFF] font-inter text-[40px] leading-8">{char}</p>
                              </div>
                            </div>
                          )}
                        </React.Fragment>
                      ))
                    ) : (
                      <div className="p-2 bg-black/50 rounded-[5px] shadow-[0_1px_3px_0_rgba(255,140,0,0.30)] border border-[#FF8C00]/20">
                        <p className="text-[#FFF] font-inter text-[20px]">Loading...</p>
                      </div>
                    )}
                  </div>
                </div>


                <div className=" p-3">
                  <div className="flex justify-between items-center mb-3">
                    <p className="text-[#FFF] font-inter text-[23px] tracking-[0.0444em]">Recent Games</p>
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                      <p className="text-[#FFF] font-inter text-xs">
                        {wsConnected ? 'Live' : 'Reconnecting...'}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                    {recentBets.length > 0 ? (
                      recentBets.map((bet, idx) => (
                        <div key={idx} className="flex justify-between items-center rounded-[5px] bg-black/50 p-1.5 md:p-2 min-h-[68px] md:h-[68px] border border-[#FF8C00]/20 overflow-hidden">
                          <div className="flex flex-col items-center w-[60px] md:w-[70px] flex-shrink-0">
                            <div className="w-4 h-4 md:w-5 md:h-5 relative mb-0.5 flex items-center justify-center">
                              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" className="md:w-5 md:h-5">
                                {bet.result === 'win' ? (
                                  <path d="M10 0C4.48 0 0 4.48 0 10C0 15.52 4.48 20 10 20C15.52 20 20 15.52 20 10C20 4.48 15.52 0 10 0ZM8 15L3 10L4.41 8.59L8 12.17L15.59 4.58L17 6L8 15Z" fill="#00FFA3" />
                                ) : bet.result === 'pending' ? (
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
                                ) : (
                                  <path d="M10 0C4.47 0 0 4.47 0 10C0 15.53 4.47 20 10 20C15.53 20 20 15.53 20 10C20 4.47 15.53 0 10 0ZM15 13.59L13.59 15L10 11.41L6.41 15L5 13.59L8.59 10L5 6.41L6.41 5L10 8.59L13.59 5L15 6.41L11.41 10L15 13.59Z" fill="#FF4444" stroke="#FF6666" strokeWidth="0.5" />
                                )}
                              </svg>
                            </div>
                            <p className="text-white font-inter text-[10px] md:text-[13px] leading-tight">{bet.result === 'win' ? "Win" : bet.result === 'pending' ? "Pending" : "Lose"}</p>
                          </div>

                          <div className="text-center flex-1 px-1 md:px-2 min-w-0">
                            <p className="text-white font-inter text-[10px] md:text-xs leading-tight">Bet Amount</p>
                            <p className="text-[#FF8C00] font-inter text-xs md:text-sm mt-0.5 leading-tight">
                              {bet.betAmount} SOL
                            </p>
                            <p className="text-white/70 font-inter text-[9px] md:text-xs leading-tight">
                              (${((bet.bet_amount ?? bet.betAmountSat) / LAMPORTS_PER_SOL * usdRate).toFixed(2)} USD)
                            </p>
                          </div>

                          <div className="text-center flex-1 px-1 md:px-2 min-w-0">
                            <p className="text-white font-inter text-[10px] md:text-xs leading-tight">Payout</p>
                            <p className={`${bet.result === 'win' ? "text-[#FF8C00]" : "text-white/50"} font-inter text-xs md:text-sm mt-0.5 leading-tight`}>
                              {bet.payoutAmount} SOL
                            </p>
                            <p className="text-white/70 font-inter text-[9px] md:text-xs leading-tight">
                              (${((bet.payout_amount ?? bet.payoutAmountSat) / LAMPORTS_PER_SOL * usdRate).toFixed(2)} USD)
                            </p>
                          </div>

                          <div className="text-center w-[50px] md:w-[70px] flex-shrink-0">
                            <p className="text-white font-inter text-[10px] md:text-xs leading-tight">Bet</p>
                            <p className="text-white font-inter text-[10px] md:text-xs mt-0.5 leading-tight">{typeof bet.bet === 'number' ? bet.bet : 'N/A'}</p>
                          </div>
                          <div className="text-center w-[50px] md:w-[70px] flex-shrink-0">
                            <p className="text-white font-inter text-[10px] md:text-xs leading-tight">Roll</p>
                            <p className="text-white font-inter text-[10px] md:text-xs mt-0.5 leading-tight">{bet.roll}</p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-4">
                        <p className="text-gray-500 text-sm">
                          {wsConnected ? 'Waiting for bets...' : 'Connecting...'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Right Panel — Deposit Address */}
            <div className="rounded-[5px] bg-[rgba(0,0,0,0.80)] p-3 border border-[#FF8C00]/20">
              <div className="text-center mb-3">
                <p className="text-[#FFF] font-inter text-[23px] tracking-[0.0437em]">Send <span className="text-[#FF8C00]">SOL</span> to Play</p>
              </div>
              <div className="flex justify-center mb-3">
                {walletAddress ? (
                  logoDataUrl ? (
                    <QRCode 
                      size={250} 
                      logoImage={logoDataUrl}
                      logoWidth={75}
                      logoHeight={75}
                      logoOpacity={0.9}
                      removeQrCodeBehindLogo={false}
                      eyeRadius={5}
                      ecLevel="H"
                      fgColor="#000000"
                      bgColor="#FFFFFF"
                      qrStyle="squares"
                      value={walletAddress} 
                    />
                  ) : (
                    <QRCode 
                      size={250} 
                      logoImage='/assets/dice.svg'
                      logoWidth={75}
                      logoHeight={75}
                      logoOpacity={0.9}
                      removeQrCodeBehindLogo={false}
                      eyeRadius={5}
                      ecLevel="H"
                      fgColor="#000000"
                      bgColor="#FFFFFF"
                      qrStyle="squares"
                      value={walletAddress} 
                    />
                  )
                ) : (
                  <div className="w-[250px] h-[250px] bg-gray-200 flex items-center justify-center rounded">
                    <p className="text-gray-500">Loading...</p>
                  </div>
                )}
              </div>
              <p className="text-[#FF8C00] font-inter text-sm mb-2">Send {formatSOL(betAmount)} SOL to this address</p>
              <div className="text-center px-2 mb-3 break-all">
                <p className="text-[#FFF] font-inter text-[13px]">
                  {walletAddress || 'Loading address...'}
                </p>
              </div>
              <div className="flex justify-center mb-2 px-2">
                <button
                  onClick={async () => {
                    if (walletAddress) {
                      try {
                        await navigator.clipboard.writeText(walletAddress);
                        setToast({ show: true, message: 'Address copied to clipboard!' });
                        setTimeout(() => setToast({ show: false, message: '' }), 3000);
                      } catch (err) {
                        console.error('Failed to copy:', err);
                        setToast({ show: true, message: 'Failed to copy address' });
                        setTimeout(() => setToast({ show: false, message: '' }), 3000);
                      }
                    }
                  }}
                  disabled={!walletAddress}
                  className="cursor-pointer w-full text-nowrap py-2 px-8 rounded-[5px] bg-[#222] shadow-[0_1px_3px_0_rgba(34,34,34,0.30)] text-[#FFF] font-arial text-xs hover:bg-[#333] transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Copy Address
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

        <div>
          <BettingHistory />
        </div>
        <Footer />
      </div>
    </ClientOnly>
    </>
  );
}