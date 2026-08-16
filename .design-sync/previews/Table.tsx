import {
  Badge,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "spendchat";

const ROWS = [
  ["14 Oct", "Weekly groceries", "🛒 Groceries", "₹1,240.00"],
  ["12 Oct", "Metro card top-up", "🚌 Transport", "₹500.00"],
  ["05 Oct", "Flight to Bengaluru", "✈️ Travel", "₹4,780.00"],
  ["01 Oct", "Rent — October", "🏠 Housing", "₹32,000.00"],
];

export function Transactions() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Merchant</TableHead>
          <TableHead>Category</TableHead>
          <TableHead className="text-right">Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {ROWS.map((r) => (
          <TableRow key={r[0]}>
            <TableCell className="whitespace-nowrap text-muted-foreground">{r[0]}</TableCell>
            <TableCell className="font-medium">{r[1]}</TableCell>
            <TableCell>
              <Badge variant="outline">{r[2]}</Badge>
            </TableCell>
            <TableCell className="text-right tabular-nums">{r[3]}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function WithFooterAndCaption() {
  return (
    <Table>
      <TableCaption>October 2026 — Personal profile</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Category</TableHead>
          <TableHead className="text-right">Spent</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {[
          ["🏠 Housing", "₹32,000.00"],
          ["🛒 Groceries", "₹6,180.00"],
          ["✈️ Travel", "₹4,780.00"],
        ].map((r) => (
          <TableRow key={r[0]}>
            <TableCell>{r[0]}</TableCell>
            <TableCell className="text-right tabular-nums">{r[1]}</TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell>Total</TableCell>
          <TableCell className="text-right tabular-nums">₹42,960.00</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}
