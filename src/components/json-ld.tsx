export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      // Data is app-controlled (no user input), but `JSON.stringify` does not
      // escape `<`, so a single `</script>` anywhere in a title, excerpt or FAQ
      // answer would close this tag early and dump the rest of the JSON into the
      // page as visible text. Escaping the one character removes the invariant
      // rather than relying on every future author honouring it.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
