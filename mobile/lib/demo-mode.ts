const DEMO_AUTH_TOKEN = "ohm.demo.token";

const DEMO_REVIEWER_ID = "11111111-1111-4111-8111-111111111111";
const DEMO_AUTHOR_ONE_ID = "22222222-2222-4222-8222-222222222222";
const DEMO_AUTHOR_TWO_ID = "33333333-3333-4333-8333-333333333333";

type DemoUser = {
  id: string;
  name: string;
  photo_url: string | null;
  interests: string[];
};

type DemoThought = {
  id: string;
  user_id: string;
  sentence: string;
  context: string;
  photo_url: string | null;
  image_url: string | null;
  created_at: string;
};

type DemoReply = {
  id: string;
  thought_id: string;
  replier_id: string;
  text: string;
  status: "pending" | "accepted" | "deleted";
  created_at: string;
};

type DemoMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  text: string;
  created_at: string;
};

type DemoCrossingDraft = {
  id: string;
  conversation_id: string;
  initiator_id: string;
  sentence: string | null;
  context: string | null;
  status: "draft" | "awaiting_other";
  submitted_at: string | null;
  auto_post_at: string | null;
  auto_posted_thought_id: string | null;
};

type DemoConversation = {
  id: string;
  thought_id: string;
  reply_id: string;
  participant_a_id: string;
  participant_b_id: string;
  message_count: number;
  last_message_at: string | null;
  participant_a_seen_at: string | null;
  participant_b_seen_at: string | null;
  is_dormant: boolean;
};

type DemoCrossing = {
  id: string;
  conversation_id: string;
  participant_a_id: string;
  participant_b_id: string;
  sentence: string;
  context: string | null;
  image_url: string | null;
  created_at: string;
};

type DemoCrossingReply = {
  id: string;
  crossing_id: string;
  replier_id: string;
  target_participant_id: string;
  text: string;
  status: "pending" | "accepted" | "deleted";
  created_at: string;
};

type DemoState = {
  users: Record<string, DemoUser>;
  thoughts: DemoThought[];
  replies: DemoReply[];
  conversations: DemoConversation[];
  messages: DemoMessage[];
  crossingDrafts: DemoCrossingDraft[];
  crossings: DemoCrossing[];
  crossingReplies: DemoCrossingReply[];
  blockedUserIds: string[];
  nextId: number;
};

export class DemoHttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "DemoHttpError";
    this.status = status;
  }
}

function nowOffset(minutesAgo: number): string {
  return new Date(Date.now() - minutesAgo * 60_000).toISOString();
}

function createInitialState(): DemoState {
  const reviewerThoughtId = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
  const authorOneThoughtId = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";
  const authorTwoThoughtId = "cccccccc-3333-4333-8333-cccccccccccc";
  const pendingReplyId = "dddddddd-4444-4444-8444-dddddddddddd";
  const acceptedReplyId = "eeeeeeee-5555-4555-8555-eeeeeeeeeeee";
  const conversationId = "ffffffff-6666-4666-8666-ffffffffffff";
  const crossingId = "99999999-7777-4777-8777-999999999999";

  return {
    users: {
      [DEMO_REVIEWER_ID]: {
        id: DEMO_REVIEWER_ID,
        name: "App Review Demo",
        photo_url: null,
        interests: ["intimacy", "creativity", "belonging"],
      },
      [DEMO_AUTHOR_ONE_ID]: {
        id: DEMO_AUTHOR_ONE_ID,
        name: "Mina Sample",
        photo_url: null,
        interests: ["design", "friendship", "identity"],
      },
      [DEMO_AUTHOR_TWO_ID]: {
        id: DEMO_AUTHOR_TWO_ID,
        name: "Leo Sample",
        photo_url: null,
        interests: ["work", "family", "transition"],
      },
    },
    thoughts: [
      {
        id: reviewerThoughtId,
        user_id: DEMO_REVIEWER_ID,
        sentence: "I want to feel less performative and more honest when I meet new people.",
        context:
          "I am trying to build closer friendships, but I still default to sounding polished instead of real.",
        photo_url: null,
        image_url: null,
        created_at: nowOffset(180),
      },
      {
        id: authorOneThoughtId,
        user_id: DEMO_AUTHOR_ONE_ID,
        sentence:
          "I miss building things just because they make me feel alive, not because they are useful.",
        context:
          "Lately everything in my life has become optimized, and I am trying to recover some play.",
        photo_url: null,
        image_url: null,
        created_at: nowOffset(120),
      },
      {
        id: authorTwoThoughtId,
        user_id: DEMO_AUTHOR_TWO_ID,
        sentence:
          "I keep wondering how adults rebuild close friendship after years of drifting apart.",
        context:
          "There are people I still love, but I no longer know how to re-enter their lives without forcing it.",
        photo_url: null,
        image_url: null,
        created_at: nowOffset(70),
      },
    ],
    replies: [
      {
        id: pendingReplyId,
        thought_id: reviewerThoughtId,
        replier_id: DEMO_AUTHOR_ONE_ID,
        text:
          "I feel this too. The most grounding thing for me has been asking one real question before I try to sound impressive.",
        status: "pending",
        created_at: nowOffset(35),
      },
      {
        id: acceptedReplyId,
        thought_id: authorOneThoughtId,
        replier_id: DEMO_REVIEWER_ID,
        text:
          "That sentence hit me. What do you make when nobody is watching and the outcome does not need to be shareable?",
        status: "accepted",
        created_at: nowOffset(95),
      },
    ],
    conversations: [
      {
        id: conversationId,
        thought_id: authorOneThoughtId,
        reply_id: acceptedReplyId,
        participant_a_id: DEMO_AUTHOR_ONE_ID,
        participant_b_id: DEMO_REVIEWER_ID,
        message_count: 10,
        last_message_at: nowOffset(24),
        participant_a_seen_at: nowOffset(24),
        participant_b_seen_at: nowOffset(24),
        is_dormant: false,
      },
    ],
    messages: [
      {
        id: "10000000-0000-4000-8000-000000000001",
        conversation_id: conversationId,
        sender_id: DEMO_REVIEWER_ID,
        text:
          "That sentence hit me. What do you make when nobody is watching and the outcome does not need to be shareable?",
        created_at: nowOffset(95),
      },
      {
        id: "10000000-0000-4000-8000-000000000002",
        conversation_id: conversationId,
        sender_id: DEMO_AUTHOR_ONE_ID,
        text:
          "When nobody is watching, I sketch spaces I want to live inside. It feels less like work and more like remembering myself.",
        created_at: nowOffset(82),
      },
      {
        id: "10000000-0000-4000-8000-000000000003",
        conversation_id: conversationId,
        sender_id: DEMO_REVIEWER_ID,
        text:
          "That makes so much sense. I think I am trying to get back to the part of me that still believes tenderness can be practical.",
        created_at: nowOffset(76),
      },
      {
        id: "10000000-0000-4000-8000-000000000004",
        conversation_id: conversationId,
        sender_id: DEMO_AUTHOR_ONE_ID,
        text:
          "That line is beautiful. It sounds like the kind of thing a crossing should hold onto.",
        created_at: nowOffset(68),
      },
      {
        id: "10000000-0000-4000-8000-000000000005",
        conversation_id: conversationId,
        sender_id: DEMO_REVIEWER_ID,
        text:
          "Let us keep it. I want the review team to feel a real thread, not an empty shell.",
        created_at: nowOffset(60),
      },
      {
        id: "10000000-0000-4000-8000-000000000006",
        conversation_id: conversationId,
        sender_id: DEMO_AUTHOR_ONE_ID,
        text:
          "The app finally feels like it holds the quiet kind of honesty I usually only trust in person.",
        created_at: nowOffset(52),
      },
      {
        id: "10000000-0000-4000-8000-000000000007",
        conversation_id: conversationId,
        sender_id: DEMO_REVIEWER_ID,
        text:
          "That is exactly what I hoped for. I want a place where reflection becomes conversation instead of performance.",
        created_at: nowOffset(45),
      },
      {
        id: "10000000-0000-4000-8000-000000000008",
        conversation_id: conversationId,
        sender_id: DEMO_AUTHOR_ONE_ID,
        text:
          "Same. It feels lighter when the exchange does not have to become content for anyone else.",
        created_at: nowOffset(39),
      },
      {
        id: "10000000-0000-4000-8000-000000000009",
        conversation_id: conversationId,
        sender_id: DEMO_REVIEWER_ID,
        text:
          "And somehow that makes me braver. I can feel myself saying what I mean sooner.",
        created_at: nowOffset(31),
      },
      {
        id: "10000000-0000-4000-8000-000000000010",
        conversation_id: conversationId,
        sender_id: DEMO_AUTHOR_ONE_ID,
        text:
          "That is enough for the first crossing. I think we have earned one shared artifact together.",
        created_at: nowOffset(24),
      },
    ],
    crossingDrafts: [],
    crossings: [
      {
        id: crossingId,
        conversation_id: conversationId,
        participant_a_id: DEMO_AUTHOR_ONE_ID,
        participant_b_id: DEMO_REVIEWER_ID,
        sentence:
          "How do we return to the parts of ourselves that felt most alive before everything became optimized?",
        context:
          "A completed crossing seeded for App Review so the shared-post surface has real content.",
        image_url: null,
        created_at: nowOffset(12),
      },
    ],
    crossingReplies: [],
    blockedUserIds: [],
    nextId: 100,
  };
}

let demoState = createInitialState();

function resetDemoState(): void {
  demoState = createInitialState();
}

function requireUser(userId: string | null | undefined): DemoUser {
  if (!userId || !demoState.users[userId]) {
    throw new DemoHttpError(401, "Demo session expired");
  }
  return demoState.users[userId];
}

function getThought(thoughtId: string): DemoThought {
  const thought = demoState.thoughts.find((entry) => entry.id === thoughtId);
  if (!thought) {
    throw new DemoHttpError(404, "Thought not found");
  }
  return thought;
}

function getConversation(conversationId: string): DemoConversation {
  const conversation = demoState.conversations.find((entry) => entry.id === conversationId);
  if (!conversation) {
    throw new DemoHttpError(404, "Conversation failed");
  }
  return conversation;
}

function getCrossing(crossingId: string): DemoCrossing {
  const crossing = demoState.crossings.find((entry) => entry.id === crossingId);
  if (!crossing) {
    throw new DemoHttpError(404, "Crossing not found");
  }
  return crossing;
}

function nextId(prefix: string): string {
  demoState.nextId += 1;
  return `${prefix}-${demoState.nextId}`;
}

function compareNewest(firstIso: string | null, secondIso: string | null): number {
  return new Date(secondIso ?? 0).getTime() - new Date(firstIso ?? 0).getTime();
}

function userCard(userId: string) {
  const user = demoState.users[userId];
  return {
    id: user.id,
    name: user.name,
    photo_url: user.photo_url,
  };
}

function activeCrossingDraft(conversationId: string): DemoCrossingDraft | null {
  return (
    demoState.crossingDrafts.find(
      (entry) =>
        entry.conversation_id === conversationId &&
        (entry.status === "draft" || entry.status === "awaiting_other")
    ) ?? null
  );
}

function completedCrossingCount(conversationId: string): number {
  return demoState.crossings.filter((entry) => entry.conversation_id === conversationId).length;
}

function nextCrossingMessageCount(conversationId: string): number {
  return (completedCrossingCount(conversationId) + 1) * 10;
}

function feedItemsFor(userId: string, limit: number) {
  const blocked = new Set(demoState.blockedUserIds);
  const items = [
    ...demoState.thoughts
      .filter((thought) => thought.user_id !== userId && !blocked.has(thought.user_id))
      .map((thought) => ({
        created_at: thought.created_at,
        item: {
          type: "thought",
          thought: {
            id: thought.id,
            sentence: thought.sentence,
            photo_url: thought.photo_url,
            image_url: thought.image_url,
            created_at: thought.created_at,
            has_context: thought.context.trim().length > 0,
          },
          user: userCard(thought.user_id),
        },
      })),
    ...demoState.crossings
      .filter(
        (crossing) =>
          !blocked.has(crossing.participant_a_id) && !blocked.has(crossing.participant_b_id)
      )
      .map((crossing) => ({
        created_at: crossing.created_at,
        item: {
          type: "crossing",
          crossing: {
            id: crossing.id,
            sentence: crossing.sentence,
            context: crossing.context,
            created_at: crossing.created_at,
          },
          participant_a: userCard(crossing.participant_a_id),
          participant_b: userCard(crossing.participant_b_id),
        },
      })),
  ]
    .sort((a, b) => compareNewest(a.created_at, b.created_at))
    .slice(0, limit)
    .map((entry) => entry.item);

  return { items, next_cursor: null };
}

function notificationsFor(userId: string) {
  const ownThoughtIds = new Set(
    demoState.thoughts.filter((thought) => thought.user_id === userId).map((thought) => thought.id)
  );
  const blocked = new Set(demoState.blockedUserIds);

  return demoState.replies
    .filter(
      (reply) =>
        reply.status === "pending" &&
        ownThoughtIds.has(reply.thought_id) &&
        !blocked.has(reply.replier_id)
    )
    .sort((a, b) => compareNewest(a.created_at, b.created_at))
    .map((reply) => ({
      reply_id: reply.id,
      replier: userCard(reply.replier_id),
      reply_preview: reply.text.slice(0, 100),
      thought: {
        id: reply.thought_id,
        sentence: getThought(reply.thought_id).sentence,
      },
      created_at: reply.created_at,
    }));
}

function thoughtDetailFor(userId: string, thoughtId: string) {
  const thought = getThought(thoughtId);
  const viewerIsAuthor = thought.user_id === userId;
  const visibleReplies = demoState.replies
    .filter((reply) => {
      if (reply.thought_id !== thoughtId) return false;
      if (viewerIsAuthor) return reply.status !== "deleted";
      return reply.status === "accepted" || reply.replier_id === userId;
    })
    .sort((a, b) => compareNewest(b.created_at, a.created_at));

  const hasPendingReply = demoState.replies.some(
    (reply) =>
      reply.thought_id === thoughtId &&
      reply.replier_id === userId &&
      reply.status === "pending"
  );

  return {
    panel_1: {
      sentence: thought.sentence,
      photo_url: thought.photo_url,
      image_url: thought.image_url,
      user: userCard(thought.user_id),
      created_at: thought.created_at,
    },
    panel_2: {
      sentence: thought.sentence,
      context: thought.context,
    },
    panel_3: {
      viewer_is_author: viewerIsAuthor,
      replies: visibleReplies.map((reply) => ({
        id: reply.id,
        user: userCard(reply.replier_id),
        text: reply.text,
        status: reply.status,
        can_delete: viewerIsAuthor && reply.status === "pending",
        created_at: reply.created_at,
      })),
      can_reply: !viewerIsAuthor && !hasPendingReply,
    },
  };
}

function conversationListFor(userId: string) {
  const blocked = new Set(demoState.blockedUserIds);
  return demoState.conversations
    .filter(
      (conversation) =>
        (conversation.participant_a_id === userId || conversation.participant_b_id === userId) &&
        !blocked.has(
          conversation.participant_a_id === userId
            ? conversation.participant_b_id
            : conversation.participant_a_id
        )
    )
    .sort((a, b) => compareNewest(a.last_message_at, b.last_message_at))
    .map((conversation) => {
      const otherUserId =
        conversation.participant_a_id === userId
          ? conversation.participant_b_id
          : conversation.participant_a_id;
      const lastMessage =
        demoState.messages
          .filter((message) => message.conversation_id === conversation.id)
          .sort((a, b) => compareNewest(a.created_at, b.created_at))[0] ?? null;
      const seenAt =
        conversation.participant_a_id === userId
          ? conversation.participant_a_seen_at
          : conversation.participant_b_seen_at;
      const unread = Boolean(
        lastMessage &&
          lastMessage.sender_id !== userId &&
          (!seenAt || new Date(lastMessage.created_at).getTime() > new Date(seenAt).getTime())
      );

      return {
        id: conversation.id,
        other_user: userCard(otherUserId),
        last_message_preview: lastMessage?.text.slice(0, 100) ?? "",
        last_message_at: conversation.last_message_at,
        is_dormant: conversation.is_dormant,
        unread,
      };
    });
}

function conversationMessages(conversationId: string, beforeId?: string, limit = 50) {
  const all = demoState.messages
    .filter((message) => message.conversation_id === conversationId)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  if (!beforeId) {
    return all.slice(-limit).map((message) => ({
      id: message.id,
      sender_id: message.sender_id,
      text: message.text,
      created_at: message.created_at,
    }));
  }

  const beforeIndex = all.findIndex((message) => message.id === beforeId);
  const slice = beforeIndex > 0 ? all.slice(Math.max(0, beforeIndex - limit), beforeIndex) : [];
  return slice.map((message) => ({
    id: message.id,
    sender_id: message.sender_id,
    text: message.text,
    created_at: message.created_at,
  }));
}

function conversationDetailFor(conversationId: string) {
  const conversation = getConversation(conversationId);
  const draft = activeCrossingDraft(conversationId);
  const thought = getThought(conversation.thought_id);

  return {
    id: conversation.id,
    message_count: conversation.message_count,
    participant_a_id: conversation.participant_a_id,
    participant_b_id: conversation.participant_b_id,
    thought: {
      id: thought.id,
      sentence: thought.sentence,
      photo_url: thought.photo_url,
      image_url: thought.image_url,
    },
    crossing_draft: draft,
    crossing_complete: completedCrossingCount(conversationId) > 0,
    crossing_available:
      Boolean(draft) || conversation.message_count >= nextCrossingMessageCount(conversationId),
    next_crossing_message_count: nextCrossingMessageCount(conversationId),
  };
}

function profileFor(targetUserId: string) {
  const user = demoState.users[targetUserId];
  if (!user) {
    throw new DemoHttpError(404, "Profile not found");
  }

  return {
    id: user.id,
    name: user.name,
    photo_url: user.photo_url,
    interests: user.interests,
    thoughts: demoState.thoughts
      .filter((thought) => thought.user_id === targetUserId)
      .sort((a, b) => compareNewest(a.created_at, b.created_at))
      .map((thought) => ({
        id: thought.id,
        sentence: thought.sentence,
        photo_url: thought.photo_url,
        image_url: thought.image_url,
        created_at: thought.created_at,
      })),
    crossings: demoState.crossings
      .filter(
        (crossing) =>
          crossing.participant_a_id === targetUserId || crossing.participant_b_id === targetUserId
      )
      .sort((a, b) => compareNewest(a.created_at, b.created_at))
      .map((crossing) => ({
        id: crossing.id,
        sentence: crossing.sentence,
        context: crossing.context,
        image_url: crossing.image_url,
        created_at: crossing.created_at,
        participant_a: userCard(crossing.participant_a_id),
        participant_b: userCard(crossing.participant_b_id),
      })),
  };
}

function acceptedCrossingReplies(crossingId: string) {
  return demoState.crossingReplies
    .filter((reply) => reply.crossing_id === crossingId && reply.status === "accepted")
    .sort((a, b) => compareNewest(a.created_at, b.created_at))
    .map((reply) => ({
      id: reply.id,
      user: userCard(reply.replier_id),
      text: reply.text,
      target_participant_id: reply.target_participant_id,
      created_at: reply.created_at,
    }));
}

export function isDemoAuthToken(token: string | null | undefined): boolean {
  return token === DEMO_AUTH_TOKEN;
}

export async function loginDemo() {
  resetDemoState();
  return {
    token: DEMO_AUTH_TOKEN,
    user_id: DEMO_REVIEWER_ID,
    onboarding_step: 1 as const,
    onboarding_complete: true,
  };
}

export async function handleDemoRequest(
  path: string,
  options: { method?: string; userId?: string | null; body?: unknown }
) {
  const method = (options.method ?? "GET").toUpperCase();
  const [pathname, rawQuery = ""] = path.split("?");
  const searchParams = new URLSearchParams(rawQuery);
  const currentUser = requireUser(options.userId);

  if (method === "GET" && pathname === "/api/feed") {
    const limit = Number.parseInt(searchParams.get("limit") ?? "20", 10) || 20;
    return feedItemsFor(currentUser.id, limit);
  }

  if (method === "GET" && pathname === "/api/notifications") {
    return notificationsFor(currentUser.id);
  }

  if (method === "GET" && pathname === "/api/conversations") {
    return conversationListFor(currentUser.id);
  }

  if (method === "GET" && pathname === "/api/blocks") {
    return demoState.blockedUserIds.map((userId) => ({
      user_id: userId,
      name: demoState.users[userId]?.name ?? null,
      photo_url: demoState.users[userId]?.photo_url ?? null,
      blocked_at: new Date().toISOString(),
    }));
  }

  if (method === "POST" && pathname === "/api/blocks") {
    const body = (options.body ?? {}) as { user_id?: string };
    if (!body.user_id || !demoState.users[body.user_id]) {
      throw new DemoHttpError(400, "Block failed");
    }
    if (!demoState.blockedUserIds.includes(body.user_id)) {
      demoState.blockedUserIds.push(body.user_id);
    }
    return null;
  }

  if (method === "PUT" && pathname === "/api/me/profile") {
    const body = (options.body ?? {}) as {
      name?: string;
      photo_url?: string;
      interests?: string[];
    };
    currentUser.name = body.name?.trim() || currentUser.name;
    currentUser.photo_url = body.photo_url?.trim() || currentUser.photo_url;
    if (Array.isArray(body.interests)) {
      currentUser.interests = body.interests.filter(
        (entry): entry is string => typeof entry === "string" && entry.trim().length > 0
      );
    }
    return {
      id: currentUser.id,
      name: currentUser.name,
      photo_url: currentUser.photo_url,
      interests: currentUser.interests,
    };
  }

  if (method === "POST" && pathname === "/api/thoughts") {
    const body = (options.body ?? {}) as {
      sentence?: string;
      context?: string;
      photo_url?: string;
    };
    const sentence = body.sentence?.trim();
    if (!sentence) {
      throw new DemoHttpError(400, "sentence required");
    }
    const thought = {
      id: nextId("thought"),
      user_id: currentUser.id,
      sentence,
      context: body.context?.trim() ?? "",
      photo_url: body.photo_url?.trim() || currentUser.photo_url,
      image_url: null,
      created_at: new Date().toISOString(),
    };
    demoState.thoughts.unshift(thought);
    return {
      id: thought.id,
      sentence: thought.sentence,
      context: thought.context,
      photo_url: thought.photo_url,
      image_url: thought.image_url,
      created_at: thought.created_at,
    };
  }

  if (method === "DELETE" && pathname === "/api/me/account") {
    return null;
  }

  if (method === "POST" && pathname === "/api/reports") {
    return {
      id: nextId("report"),
      created_at: new Date().toISOString(),
    };
  }

  if (pathname === "/api/push/register" && (method === "POST" || method === "DELETE")) {
    return null;
  }

  const userProfileMatch = pathname.match(/^\/api\/users\/([^/]+)\/profile$/);
  if (method === "GET" && userProfileMatch) {
    return profileFor(userProfileMatch[1]);
  }

  const thoughtMatch = pathname.match(/^\/api\/thoughts\/([^/]+)$/);
  if (thoughtMatch) {
    const thoughtId = thoughtMatch[1];

    if (method === "GET") {
      return thoughtDetailFor(currentUser.id, thoughtId);
    }

    if (method === "DELETE") {
      const thought = getThought(thoughtId);
      if (thought.user_id !== currentUser.id) {
        throw new DemoHttpError(403, "Delete failed");
      }
      demoState.thoughts = demoState.thoughts.filter((entry) => entry.id !== thoughtId);
      demoState.replies = demoState.replies.filter((entry) => entry.thought_id !== thoughtId);
      return null;
    }

    if (method === "PUT") {
      const thought = getThought(thoughtId);
      if (thought.user_id !== currentUser.id) {
        throw new DemoHttpError(403, "Edit failed");
      }
      const body = (options.body ?? {}) as {
        sentence?: string;
        context?: string;
        photo_url?: string;
      };
      thought.sentence = body.sentence?.trim() || thought.sentence;
      if (typeof body.context === "string") {
        thought.context = body.context.trim();
      }
      if (typeof body.photo_url === "string") {
        thought.photo_url = body.photo_url.trim() || null;
      }
      return {
        id: thought.id,
        sentence: thought.sentence,
        context: thought.context,
        photo_url: thought.photo_url,
        image_url: thought.image_url,
        created_at: thought.created_at,
      };
    }
  }

  const thoughtReplyMatch = pathname.match(/^\/api\/thoughts\/([^/]+)\/reply$/);
  if (method === "POST" && thoughtReplyMatch) {
    const thought = getThought(thoughtReplyMatch[1]);
    if (thought.user_id === currentUser.id) {
      throw new DemoHttpError(403, "Reply failed");
    }
    const body = (options.body ?? {}) as { text?: string };
    const text = body.text?.trim();
    if (!text) {
      throw new DemoHttpError(400, "text required");
    }
    const reply = {
      id: nextId("reply"),
      thought_id: thought.id,
      replier_id: currentUser.id,
      text,
      status: "pending" as const,
      created_at: new Date().toISOString(),
    };
    demoState.replies.unshift(reply);
    return { id: reply.id, status: reply.status, created_at: reply.created_at };
  }

  const acceptReplyMatch = pathname.match(/^\/api\/replies\/([^/]+)\/accept$/);
  if (method === "POST" && acceptReplyMatch) {
    const replyId = acceptReplyMatch[1];
    const reply = demoState.replies.find((entry) => entry.id === replyId);
    if (!reply) {
      throw new DemoHttpError(404, "Accept failed");
    }
    const thought = getThought(reply.thought_id);
    if (thought.user_id !== currentUser.id) {
      throw new DemoHttpError(403, "Accept failed");
    }
    reply.status = "accepted";

    const conversation = {
      id: nextId("conversation"),
      thought_id: thought.id,
      reply_id: reply.id,
      participant_a_id: thought.user_id,
      participant_b_id: reply.replier_id,
      message_count: 1,
      last_message_at: new Date().toISOString(),
      participant_a_seen_at: new Date().toISOString(),
      participant_b_seen_at: new Date().toISOString(),
      is_dormant: false,
    };
    demoState.conversations.unshift(conversation);
    demoState.messages.push({
      id: nextId("message"),
      conversation_id: conversation.id,
      sender_id: reply.replier_id,
      text: reply.text,
      created_at: conversation.last_message_at,
    });
    return { conversation_id: conversation.id };
  }

  const ignoreReplyMatch = pathname.match(/^\/api\/replies\/([^/]+)\/ignore$/);
  if (method === "POST" && ignoreReplyMatch) {
    const reply = demoState.replies.find((entry) => entry.id === ignoreReplyMatch[1]);
    if (!reply) {
      throw new DemoHttpError(404, "Ignore failed");
    }
    const thought = getThought(reply.thought_id);
    if (thought.user_id !== currentUser.id) {
      throw new DemoHttpError(403, "Ignore failed");
    }
    reply.status = "deleted";
    return null;
  }

  const conversationMatch = pathname.match(/^\/api\/conversations\/([^/]+)$/);
  if (method === "GET" && conversationMatch) {
    const conversation = getConversation(conversationMatch[1]);
    if (
      conversation.participant_a_id !== currentUser.id &&
      conversation.participant_b_id !== currentUser.id
    ) {
      throw new DemoHttpError(403, "Conversation failed");
    }
    return conversationDetailFor(conversation.id);
  }

  const conversationMessagesMatch = pathname.match(/^\/api\/conversations\/([^/]+)\/messages$/);
  if (conversationMessagesMatch) {
    const conversation = getConversation(conversationMessagesMatch[1]);
    if (
      conversation.participant_a_id !== currentUser.id &&
      conversation.participant_b_id !== currentUser.id
    ) {
      throw new DemoHttpError(403, "Messages failed");
    }

    if (method === "GET") {
      const limit = Number.parseInt(searchParams.get("limit") ?? "50", 10) || 50;
      const beforeId = searchParams.get("before_id") ?? undefined;
      return conversationMessages(conversation.id, beforeId, limit);
    }

    if (method === "POST") {
      const body = (options.body ?? {}) as { text?: string };
      const text = body.text?.trim();
      if (!text) {
        throw new DemoHttpError(400, "Send failed");
      }
      const message = {
        id: nextId("message"),
        conversation_id: conversation.id,
        sender_id: currentUser.id,
        text,
        created_at: new Date().toISOString(),
      };
      demoState.messages.push(message);
      conversation.message_count += 1;
      conversation.last_message_at = message.created_at;
      if (conversation.participant_a_id === currentUser.id) {
        conversation.participant_a_seen_at = message.created_at;
      } else {
        conversation.participant_b_seen_at = message.created_at;
      }
      conversation.is_dormant = false;
      return {
        id: message.id,
        text: message.text,
        created_at: message.created_at,
      };
    }
  }

  const crossingStartMatch = pathname.match(/^\/api\/conversations\/([^/]+)\/crossing\/start$/);
  if (method === "POST" && crossingStartMatch) {
    const conversation = getConversation(crossingStartMatch[1]);
    const existingDraft = activeCrossingDraft(conversation.id);
    if (existingDraft) return existingDraft;
    if (conversation.message_count < nextCrossingMessageCount(conversation.id)) {
      throw new DemoHttpError(
        403,
        `conversation needs ${nextCrossingMessageCount(conversation.id)}+ messages`
      );
    }
    const draft = {
      id: nextId("crossing-draft"),
      conversation_id: conversation.id,
      initiator_id: currentUser.id,
      sentence: null,
      context: null,
      status: "draft" as const,
      submitted_at: null,
      auto_post_at: null,
      auto_posted_thought_id: null,
    };
    demoState.crossingDrafts.push(draft);
    return draft;
  }

  const crossingDraftMatch = pathname.match(/^\/api\/conversations\/([^/]+)\/crossing$/);
  if (crossingDraftMatch) {
    const draft = activeCrossingDraft(crossingDraftMatch[1]);
    if (method === "GET") {
      if (!draft) throw new DemoHttpError(404, "Get crossing failed");
      return draft;
    }

    if (method === "PUT") {
      if (!draft) throw new DemoHttpError(404, "Update crossing failed");
      if (draft.initiator_id !== currentUser.id) {
        throw new DemoHttpError(403, "Update crossing failed");
      }
      const body = (options.body ?? {}) as { sentence?: string; context?: string };
      if (typeof body.sentence === "string") draft.sentence = body.sentence.trim() || null;
      if (typeof body.context === "string") draft.context = body.context.trim() || null;
      return null;
    }
  }

  const crossingCompleteMatch = pathname.match(
    /^\/api\/conversations\/([^/]+)\/crossing\/complete$/
  );
  if (method === "POST" && crossingCompleteMatch) {
    const draft = activeCrossingDraft(crossingCompleteMatch[1]);
    if (!draft) throw new DemoHttpError(404, "Complete crossing failed");
    const body = (options.body ?? {}) as { sentence?: string; context?: string };

    if (draft.initiator_id === currentUser.id) {
      draft.sentence = body.sentence?.trim() || draft.sentence;
      draft.context =
        typeof body.context === "string" ? body.context.trim() || null : draft.context;
      if (!draft.sentence) {
        throw new DemoHttpError(400, "sentence required");
      }
      draft.status = "awaiting_other";
      draft.submitted_at = new Date().toISOString();
      draft.auto_post_at = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
      return { status: "awaiting_other", auto_post_at: draft.auto_post_at };
    }

    const conversation = getConversation(draft.conversation_id);
    const crossing = {
      id: nextId("crossing"),
      conversation_id: conversation.id,
      participant_a_id: conversation.participant_a_id,
      participant_b_id: conversation.participant_b_id,
      sentence: draft.sentence ?? "Shared crossing",
      context: draft.context,
      image_url: null,
      created_at: new Date().toISOString(),
    };
    demoState.crossings.unshift(crossing);
    demoState.crossingDrafts = demoState.crossingDrafts.filter((entry) => entry.id !== draft.id);
    return {
      status: "complete",
      id: crossing.id,
      sentence: crossing.sentence,
      context: crossing.context,
      image_url: crossing.image_url,
    };
  }

  const crossingAbandonMatch = pathname.match(
    /^\/api\/conversations\/([^/]+)\/crossing\/abandon$/
  );
  if (method === "POST" && crossingAbandonMatch) {
    demoState.crossingDrafts = demoState.crossingDrafts.filter(
      (entry) => entry.conversation_id !== crossingAbandonMatch[1]
    );
    return null;
  }

  const crossingMatch = pathname.match(/^\/api\/crossings\/([^/]+)$/);
  if (method === "GET" && crossingMatch) {
    const crossing = getCrossing(crossingMatch[1]);
    const isParticipant =
      currentUser.id === crossing.participant_a_id || currentUser.id === crossing.participant_b_id;
    const hasPendingReply = demoState.crossingReplies.some(
      (reply) =>
        reply.crossing_id === crossing.id &&
        reply.replier_id === currentUser.id &&
        reply.status === "pending"
    );

    return {
      panel_1: {
        id: crossing.id,
        sentence: crossing.sentence,
        participant_a: userCard(crossing.participant_a_id),
        participant_b: userCard(crossing.participant_b_id),
        created_at: crossing.created_at,
      },
      panel_2: {
        sentence: crossing.sentence,
        context: crossing.context,
      },
      panel_3: {
        accepted_replies: acceptedCrossingReplies(crossing.id),
        can_reply: !isParticipant && !hasPendingReply,
      },
    };
  }

  const crossingReplyMatch = pathname.match(/^\/api\/crossings\/([^/]+)\/reply$/);
  if (method === "POST" && crossingReplyMatch) {
    const crossing = getCrossing(crossingReplyMatch[1]);
    const body = (options.body ?? {}) as { text?: string; target_participant_id?: string };
    const text = body.text?.trim();
    if (!text || !body.target_participant_id) {
      throw new DemoHttpError(400, "Reply failed");
    }
    if (
      currentUser.id === crossing.participant_a_id ||
      currentUser.id === crossing.participant_b_id
    ) {
      throw new DemoHttpError(403, "participants cannot reply to their own crossing");
    }
    const reply = {
      id: nextId("crossing-reply"),
      crossing_id: crossing.id,
      replier_id: currentUser.id,
      target_participant_id: body.target_participant_id,
      text,
      status: "pending" as const,
      created_at: new Date().toISOString(),
    };
    demoState.crossingReplies.unshift(reply);
    return { id: reply.id, status: reply.status, created_at: reply.created_at };
  }

  const unblockMatch = pathname.match(/^\/api\/blocks\/([^/]+)$/);
  if (method === "DELETE" && unblockMatch) {
    demoState.blockedUserIds = demoState.blockedUserIds.filter(
      (entry) => entry !== unblockMatch[1]
    );
    return null;
  }

  const blockStatusMatch = pathname.match(/^\/api\/blocks\/([^/]+)\/status$/);
  if (method === "GET" && blockStatusMatch) {
    return { blocked: demoState.blockedUserIds.includes(blockStatusMatch[1]) };
  }

  throw new DemoHttpError(404, `Demo endpoint not implemented: ${method} ${pathname}`);
}
