import { CurrencyCombobox, Label } from "spendchat";

export function Default() {
  return (
    <div className="grid w-64 gap-1.5">
      <Label htmlFor="currency">Workspace currency</Label>
      <CurrencyCombobox id="currency" value="INR" onValueChange={() => {}} />
      <p className="text-xs text-muted-foreground">
        Every member sees amounts in this currency.
      </p>
    </div>
  );
}

export function OtherCurrencies() {
  return (
    <div className="grid w-64 gap-3">
      <CurrencyCombobox value="USD" onValueChange={() => {}} />
      <CurrencyCombobox value="EUR" onValueChange={() => {}} />
      <CurrencyCombobox value="JPY" onValueChange={() => {}} />
    </div>
  );
}

export function Disabled() {
  return (
    <div className="w-64">
      <CurrencyCombobox value="INR" onValueChange={() => {}} disabled />
    </div>
  );
}
