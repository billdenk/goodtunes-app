import {
  reactExtension,
  Banner,
  BlockStack,
  Link,
  Text,
  useApi,
  useSessionToken,
  useSubscription,
} from "@shopify/ui-extensions-react/checkout";
import { useRedemptionPoll } from "./useRedemptionPoll";

export default reactExtension("purchase.thank-you.block.render", () => <GoodTunesRedemption />);

function GoodTunesRedemption() {
  // purchase.thank-you has NO `order` in its API — useOrder() throws
  // ExtensionHasNoMethodError on this target, which blanked the whole
  // block. The thank-you surface exposes `orderConfirmation` instead:
  // `.order.id` is the (future) Order gid and `.number` is the
  // buyer-visible confirmation number the redemption-status endpoint
  // verifies before releasing the code.
  const api = useApi<"purchase.thank-you.block.render">();
  const confirmation = useSubscription(api.orderConfirmation);
  const sessionToken = useSessionToken();
  const redemption = useRedemptionPoll(confirmation?.order?.id, confirmation?.number, sessionToken);

  if (!redemption) {
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

  return (
    <Banner title="Your digital album is ready" status="success">
      <BlockStack spacing="tight">
        <Text>Your GoodTunes digital album is included with this order.</Text>
        <Link to={redemption.url} external>
          Get your music now →
        </Link>
        <Text>Or enter code {redemption.code} at goodtunes.music</Text>
      </BlockStack>
    </Banner>
  );
}
