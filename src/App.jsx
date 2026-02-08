import React from 'react';
import Header from './components/Header';
import Hero from './components/Hero';
import MentalLoad from './components/MentalLoad';
import FeatureCards from './components/FeatureCards';
import WaitlistForm from './components/WaitlistForm';
import Footer from './components/Footer';

function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-cyan-50">
      <Header />
      <main>
        <Hero />
        <MentalLoad />
        <FeatureCards />
        <WaitlistForm />
      </main>
      <Footer />
    </div>
  );
}

export default App;
