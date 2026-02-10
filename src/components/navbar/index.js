import { useState, useEffect } from "react"
import { Menu, X } from "lucide-react"
import Link from "next/link"

export default function Navbar() {
    const [open, setOpen] = useState(false)
    const [showHowToPlay, setShowHowToPlay] = useState(false)
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    return (
        <nav className="w-full bg-black py-1" suppressHydrationWarning>
            {showHowToPlay && (
                <HowToPlayModal onClose={() => setShowHowToPlay(false)} />
            )}
            <div className="hidden md:flex items-center justify-center gap-8 py-6" suppressHydrationWarning>

                <div className="flex items-center gap-3">
                    <Link href="/">
                        <img src="/assets/solana-logo.svg" className="h-16" suppressHydrationWarning alt="Solana" />
                    </Link>
                    <Link href="/">
                        <span className="text-white text-2xl font-semibold">Solana Dice</span>
                    </Link>
                </div>

                {/* How To Play */}
                <button onClick={() => setShowHowToPlay(true)} className="bg-[#FF8C00] text-white font-semibold px-5 py-2 rounded-full hover:bg-[#FFA500] transition-colors">
                    How To Play
                </button>

                {/* Links */}
                <a href="/rules" className="text-white text-xl hover:text-[#FF8C00] transition-colors">
                    Rules
                </a>

                <a href="/fair" className="text-white text-xl hover:text-[#FF8C00] transition-colors">
                    Provably Fair
                </a>
            </div>

            {/* Mobile */}
            <div className="md:hidden flex items-center justify-between px-4 py-4" suppressHydrationWarning>
                <Link href="/" className="flex items-center gap-2">
                    <img src="/assets/solana-logo.svg" className="h-12" suppressHydrationWarning alt="Solana" />
                    <span className="text-white text-xl font-semibold">Solana Dice</span>
                </Link>
                {mounted && (
                    <button onClick={() => setOpen(!open)} className="text-white" suppressHydrationWarning>
                        {open ? <X size={28} suppressHydrationWarning /> : <Menu size={28} suppressHydrationWarning />}
                    </button>
                )}
            </div>

            {/* Mobile Menu */}
            {open && (
                <div className="md:hidden flex flex-col items-center gap-4 pb-6">
                    <button onClick={() => setShowHowToPlay(true)} className="bg-[#FF8C00] text-white font-semibold px-5 py-2 rounded-full hover:bg-[#FFA500] transition-colors">
                        How To Play
                    </button>

                    <a href="/rules" className="text-white text-lg">
                        Rules
                    </a>

                    <a href="/fair" className="text-white text-lg">
                        Provably Fair
                    </a>
                </div>
            )}
        </nav>
    )
}
function HowToPlayModal({ onClose }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
            <div className="relative w-full max-w-2xl mx-4 rounded-xl bg-black p-8 text-white border border-[#FF8C00]/20">

                {/* Close button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 left-4 bg-[#FF8C00] text-white px-6 py-2 rounded-full font-medium hover:bg-[#FFA500] transition-colors"
                >
                    Close
                </button>

                {/* Title */}
                <h1 className="text-center text-4xl font-semibold mb-10">
                    Win massive amounts of <br /> <span className="text-[#FF8C00]">SOL</span>
                </h1>

                {/* Steps */}
                <div className="space-y-10">

                    {/* Step 1 */}
                    <div className="flex items-start gap-5">
                    <div className="text-[#FF8C00] text-4xl">◎</div>
                        <div>
                            <h2 className="text-[#FF8C00] text-2xl font-semibold mb-2">
                                Step 1
                            </h2>
                            <p className="text-lg">
                                Send SOL to an address below to place a bet.
                            </p>
                            <p className="mt-2 text-gray-400 font-semibold">
                                DO NOT SEND FROM AN EXCHANGE WALLET
                            </p>
                        </div>
                    </div>

                    {/* Step 2 */}
                    <div className="flex items-start gap-5">
                        <div className="text-[#FF8C00] text-4xl">🎲</div>
                        <div>
                            <h2 className="text-[#FF8C00] text-2xl font-semibold mb-2">
                                Step 2
                            </h2>
                            <p className="text-lg">
                                The system will roll the dice and pick a Lucky Number!
                            </p>
                        </div>
                    </div>

                    {/* Step 3 */}
                    <div className="flex items-start gap-5">
                        <div className="text-[#FF8C00] text-4xl">✔</div>
                        <div>
                            <h2 className="text-[#FF8C00] text-2xl font-semibold mb-2">
                                Step 3
                            </h2>
                            <p className="text-lg">
                                You win if the Lucky number is less than the number you chose.
                            </p>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    )
}
