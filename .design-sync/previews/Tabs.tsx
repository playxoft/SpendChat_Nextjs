import { Tabs, TabsContent, TabsList, TabsTrigger } from "spendchat";

export function Default() {
  return (
    <Tabs defaultValue="all" className="w-96">
      <TabsList>
        <TabsTrigger value="all">All</TabsTrigger>
        <TabsTrigger value="expense">Expenses</TabsTrigger>
        <TabsTrigger value="income">Income</TabsTrigger>
      </TabsList>
      <TabsContent value="all" className="pt-3 text-sm text-muted-foreground">
        412 transactions across 3 profiles this month.
      </TabsContent>
    </Tabs>
  );
}

export function LineVariant() {
  return (
    <Tabs defaultValue="grid" className="w-96">
      <TabsList variant="line">
        <TabsTrigger value="grid">Grid</TabsTrigger>
        <TabsTrigger value="list">List</TabsTrigger>
        <TabsTrigger value="column">Column</TabsTrigger>
      </TabsList>
      <TabsContent value="grid" className="pt-3 text-sm text-muted-foreground">
        Vault items as thumbnails.
      </TabsContent>
    </Tabs>
  );
}

export function Vertical() {
  return (
    <Tabs defaultValue="account" orientation="vertical" className="flex w-96 gap-4">
      <TabsList>
        <TabsTrigger value="account">Account</TabsTrigger>
        <TabsTrigger value="workspace">Workspace</TabsTrigger>
        <TabsTrigger value="voice">Voice</TabsTrigger>
      </TabsList>
      <TabsContent value="account" className="text-sm text-muted-foreground">
        Name, email and password.
      </TabsContent>
    </Tabs>
  );
}
