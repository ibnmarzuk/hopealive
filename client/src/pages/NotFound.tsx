import { ArrowUpRight, Compass, Home } from "lucide-react";
import { useLocation } from "wouter";

function Mark() {
  return (
    <span className="relative inline-flex h-12 w-12 items-center justify-center rounded-full border border-[#254033]/15 bg-[#f9f4e8] shadow-[0_12px_30px_rgba(33,53,47,0.12)]" aria-hidden="true">
      <span className="absolute h-6 w-6 rounded-full border-[3px] border-[#254033]" />
      <span className="absolute h-3 w-3 -translate-y-2 rounded-full bg-[#d5a25d]" />
    </span>
  );
}

export default function NotFound() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen w-full bg-[#f4efe7] px-4 py-12 text-[#21352f]">
      <div className="mx-auto flex max-w-4xl flex-col items-center rounded-[28px] border border-[#2d453f]/10 bg-[#fffaf2]/90 p-6 shadow-[0_28px_80px_rgba(23,36,33,0.12)] backdrop-blur-sm md:p-12">
        <div className="mb-6 flex items-center gap-3">
          <Mark />
          <div className="flex flex-col leading-none">
            <span className="text-[0.72rem] font-black uppercase tracking-[0.28em] text-[#6d7d69]">hope-alive</span>
            <span className="text-xs text-[#4a5c54]">Islamic vacation course</span>
          </div>
        </div>

        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#2d453f]/10 bg-[#e7f1ea] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[#234b3c]">
          <Compass className="h-3.5 w-3.5" />
          404 route not found
        </div>

        <h1 className="text-5xl font-black tracking-[-0.06em] md:text-7xl">Lost your way?</h1>
        <p className="mt-4 max-w-xl text-center text-base leading-7 text-[#3a4c47] md:text-lg">
          This page is not available right now. Head back to the main programme page or go straight to registration.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => setLocation("/")}
            className="inline-flex items-center justify-center rounded-full bg-[#21352f] px-6 py-3 text-sm font-semibold text-[#f8f0df] transition hover:bg-[#192a26]"
          >
            <Home className="mr-2 h-4 w-4" />
            Go home
          </button>
          <button
            type="button"
            onClick={() => setLocation("/register")}
            className="inline-flex items-center justify-center rounded-full border border-[#21352f]/20 bg-white px-6 py-3 text-sm font-semibold text-[#21352f] transition hover:border-[#21352f]/40 hover:bg-[#f9f4e8]"
          >
            Register now
            <ArrowUpRight className="ml-2 h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
