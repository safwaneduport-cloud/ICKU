// Indian rupee formatting (₹1,23,456).
export const inr = (n) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
