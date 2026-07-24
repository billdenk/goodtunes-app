import {
  reactExtension,
  Banner,
  BlockStack,
  Link,
  Text,
  useMetafield,
} from "@shopify/ui-extensions-react/customer-account";

export default reactExtension(
  "customer-account.order-status.block.render",
  () => <GoodTunesRedemption />,
);

function GoodTunesRedemption() {
  const metafield = useMetafield({ namespace: "goodtunes", key: "redemption" });

  if (!metafield?.value) {
    return (
      <Banner title="Your digital album is being prepared" status="info">
        <BlockStack spacing="tight">
          <Text>
            Your GoodTunes digital album access is on its way — this usually
            takes less than a minute. Check your email for the access link, or
            visit your music library once it arrives.
          </Text>
          <Link to="https://my.goodtunes.music/library" external>
            Go to my music library →
          </Link>
        </BlockStack>
      </Banner>
    );
  }

  let code = "";
  let url = "";
  try {
    const data = JSON.parse(metafield.value) as { code?: string; url?: string };
    code = data.code ?? "";
    url = data.url ?? "";
  } catch {
    return null;
  }
  if (!code || !url) return null;

  return (
    <Banner title="Your digital album is ready" status="success">
      <BlockStack spacing="tight">
        <Text>
          Your GoodTunes digital album is included with this order.
        </Text>
        <Link to={url} external>
          Get your music now →
        </Link>
        <Text>
          Or enter code {code} at goodtunes.music
        </Text>
      </BlockStack>
    </Banner>
  );
}
