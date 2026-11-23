export {
  DEFAULT_ACCOUNT_ID,
  FAKE_ADAPTER,
  FAKE_PROVIDER,
  createFakeChannel,
  type FakeAgentMessage,
  type FakeChannel,
  type FakeChannelOptions,
  type FakeInbound,
  type OutboxItem,
} from "./fake-channel.js";
export { fakeChannelRoutes } from "./http-routes.js";
export { splitForChannel } from "../shared/split.js";
