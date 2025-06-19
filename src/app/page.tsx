'use client';

import dynamic from 'next/dynamic';
const Map = dynamic(() => import('./components/Map'), { ssr: false });


export default function Home() {
  return (
    <div className="h-screen w-full bg-[url('/images/makrill-bg.jpg')] bg-cover bg-center bg-no-repeat flex flex-col justify-center items-center px-4 py-8">
      
      {/* Top-fade overlay */}
      <div className="absolute top-0 left-0 right-0 h-[120px] bg-gradient-to-b from-black/40 to-transparent z-10" />
      
      {/* Rubrik */}
      <div className="text-center text-white mb-6">
        <h1 className="text-4xl font-extrabold drop-shadow-lg">Makrill-Sverige</h1>
        <p className="text-md mt-2 max-w-xl drop-shadow-sm">
          Utforska väder, havsdata och makrillens rörelser längs Sveriges västkust och Öresund.
        </p>
      </div>

      {/* Karta med inre höjd och rundade hörn */}
      <div className="w-full max-w-6xl h-[75vh] rounded-xl overflow-hidden shadow-2xl border border-white/0">
        <Map />
      </div>
    </div>
  );
}
