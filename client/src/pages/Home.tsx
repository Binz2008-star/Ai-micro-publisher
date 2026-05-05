import { Link } from "wouter";
import { FlaskConical, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-6">
      <div className="max-w-md text-center space-y-6">
        <div className="flex justify-center">
          <div className="bg-indigo-100 rounded-2xl p-4">
            <FlaskConical size={40} className="text-indigo-600" />
          </div>
        </div>
        <h1 className="text-3xl font-bold text-slate-900">AI Micro-Publisher</h1>
        <p className="text-slate-500 text-base leading-relaxed">
          Autonomous 24/7 content publishing platform. Discovers trending topics, generates
          quality-checked articles, and monetizes real human traffic.
        </p>
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
          <strong>Milestone 0 in progress</strong> — validating the core loop before production infrastructure.
        </div>
        <Link href="/prototype">
          <Button className="bg-indigo-600 hover:bg-indigo-700 text-white w-full">
            <FlaskConical size={16} className="mr-2" />
            Open M0 Prototype
            <ArrowRight size={16} className="ml-2" />
          </Button>
        </Link>
      </div>
    </div>
  );
}
