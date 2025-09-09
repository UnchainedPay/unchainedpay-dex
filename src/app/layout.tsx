import './globals.css';

export const metadata = {
  title: 'UnchainedPay — Swap / Bridge / Pay',
  description: 'DEX UI on Pepe Unchained V2'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <div className="wrap">{children}</div>
      </body>
    </html>
  );
}