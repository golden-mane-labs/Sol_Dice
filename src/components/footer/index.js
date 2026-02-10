import { useState } from "react"

export default function Footer() {


    return (
        <footer className="w-full bg-black gap-4 text-white flex flex-col items-center py-6">


            <img src="/assets/solana-logo.svg" className="h-8" suppressHydrationWarning alt="Solana Dice" />
            <div className="text-center">
                <p className="text-white text-sm font-semibold">Solana Dice</p>
            </div>
            <div className="text-center">
                <a 
                    href="https://t.me/Onlybitcoinsupport" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-[#FF8C00] hover:text-[#FFA500] transition-colors text-sm"
                >
                    Telegram: @Onlybitcoinsupport
                </a>
            </div>
            <div>Copyright 2018
            </div>


        </footer>
    )
}
