---
title: Design a Chat Application (WhatsApp-like)
level: intermediate
time: 65
summary: Users, one-to-one and group chats, message status (sent, delivered, read), offline delivery with a pending queue, presence, message history with pagination, a Mediator-style chat server, and the thread-safety and ordering guarantees.
---

:::problem Design a Chat Application {level=medium tags="Mediator,Observer,messaging,presence,state,groups"}
Design the core of a chat application. Users send messages to another user or to a group. Messages are delivered in order, show **sent / delivered / read** status, and are stored until the recipient comes online. Show who is online, keep chat history with pagination, and support groups where adding/removing members and admin rights exist.
:::

:::hint Hint
Users should not talk to each other directly. A **ChatServer** (Mediator) routes messages. A chat (conversation) owns an ordered list of messages; delivery state is tracked per recipient. An offline user's incoming messages wait in a queue and are delivered when they connect.
:::

## Step 1: requirements

| Question | Assumption |
|---|---|
| Chats? | one-to-one and group (many members) |
| Messages? | text with id, sender, time, per-recipient status |
| Status? | Sent (server has it) → Delivered (recipient device got it) → Read (recipient opened the chat) |
| Offline users? | messages are stored and delivered on connect, in order |
| Presence? | online/offline with last-seen time |
| Groups? | admins can add/remove members; a removed member stops receiving new messages |
| History? | fetch the last N messages, older pages by cursor |
| Ordering? | messages in a chat are totally ordered by a server-assigned sequence number |
| Concurrency? | many users send simultaneously |
| Out of scope | end-to-end encryption, media, push notifications, multi-device sync |

## Step 2: message status

```viz algo=state title="Delivery status of one message to one recipient"
state Sent "Sent" [initial] @0,1
state Delivered "Delivered" @1,1
state Read "Read" @2,1
Sent -> Delivered : recipient online (or comes online)
Delivered -> Read : recipient opens the chat
play: recipient online (or comes online), recipient opens the chat
```

## Step 3: entities

```viz algo=uml title="Chat application"
class ChatServer
  + connect(u: User): void
  + disconnect(u: User): void
  + openDirect(a: User, b: User): Chat
  + createGroup(owner: User, name: string, members: User[]): Chat
  + send(from: User, chat: Chat, text: string): Message
  + markRead(u: User, chat: Chat): void
abstract class Chat
  # id: int
  # messages: Message[]
  # nextSeq: long
  + members(): User[]
  + canSend(u: User): bool
class DirectChat
class GroupChat
  - name: string
  - admins: set<User>
  + addMember(by: User, u: User): bool
  + removeMember(by: User, u: User): bool
class Message
  - seq: long
  - sender: User
  - text: string
  - time: long
  - status: map<User, Status>
class User
  - name: string
  - online: bool
  - lastSeen: long
  - inbox: Delivery[]
interface MessageListener
  + onMessage(chat: Chat, m: Message): void
  + onStatus(chat: Chat, m: Message, by: User, s: Status): void
DirectChat --|> Chat
GroupChat --|> Chat
Chat *-- Message
ChatServer o-- Chat
ChatServer o-- User
User ..|> MessageListener
```

## Step 4: design decisions

- **`ChatServer` is a Mediator**: users call `send`; the server stores the message in the chat, then **fans out** to each member (except the sender).
- **Per-chat sequence number** assigned under the chat's lock gives a total order, which every client uses for display and for resuming ("give me everything after seq 42").
- **Delivery state per recipient** (`map<User, Status>` inside the message): essential for groups ("delivered to 3 of 5").
- **Offline queue per user**: if the recipient is offline, the delivery task stays in the user's `pending` list. `connect()` flushes it **in sequence order** and marks messages Delivered.
- **Read receipts**: `markRead(user, chat)` marks everything up to the latest seq as Read for that user and notifies the senders (Observer).
- **Group rules** in `GroupChat`: only members may send; only admins may add/remove; a removed member sees no new messages (their old history remains).
- **Locking**: one mutex per chat for sequencing and status; one for user presence/inbox. Listener callbacks happen after releasing locks.
- **History pagination** by `(chat, beforeSeq, limit)`: stable cursors.

## Step 5: the code

```cpp run title="Direct and group chats, offline delivery, receipts, history"
#include <algorithm>
#include <iostream>
#include <map>
#include <memory>
#include <mutex>
#include <set>
#include <string>
#include <vector>
using namespace std;

enum class Status { Sent, Delivered, Read };
const char* statusName(Status s) { return s == Status::Sent ? "sent" : s == Status::Delivered ? "delivered" : "read"; }

class Chat;
struct Message { long seq; string sender; string text; long time; map<string, Status> status; };

struct MessageListener {
    virtual ~MessageListener() = default;
    virtual void onMessage(const string& chat, const Message& m) = 0;
    virtual void onStatus(const string& chat, long seq, const string& by, Status s) = 0;
};

struct User : MessageListener {
    string name; bool online = false; long lastSeen = 0;
    vector<pair<Chat*, long>> pending;                        // (chat, seq) waiting for this user to come online
    explicit User(string n) : name(move(n)) {}
    void onMessage(const string& chat, const Message& m) override { cout << "    [" << name << " receives in " << chat << "] #" << m.seq << " " << m.sender << ": " << m.text << "\n"; }
    void onStatus(const string& chat, long seq, const string& by, Status s) override { cout << "    [" << name << " sees in " << chat << "] message #" << seq << " is " << name_(s) << " for " << by << "\n"; }
private:
    static const char* name_(Status s) { return statusName(s); }
};

class Chat {
protected:
    string title_; vector<Message> messages_; long nextSeq_ = 1; mutable mutex m_;
public:
    explicit Chat(string t) : title_(move(t)) {}
    virtual ~Chat() = default;
    const string& title() const { return title_; }
    virtual vector<User*> members() const = 0;
    virtual bool canSend(const User* u) const { auto m = members(); return find(m.begin(), m.end(), u) != m.end(); }

    Message append(const User& sender, string text, long now) {
        lock_guard l(m_);
        Message msg{nextSeq_++, sender.name, move(text), now, {}};
        for (User* u : members()) msg.status[u->name] = Status::Sent;
        msg.status.erase(sender.name);                         // the sender does not "receive" their own message
        messages_.push_back(msg);
        return msg;
    }
    void setStatus(long seq, const string& user, Status s) { lock_guard l(m_); messages_[seq - 1].status[user] = s; }
    Status statusOf(long seq, const string& user) const { lock_guard l(m_); return messages_[seq - 1].status.at(user); }
    long lastSeq() const { lock_guard l(m_); return nextSeq_ - 1; }
    const Message& message(long seq) const { lock_guard l(m_); return messages_[seq - 1]; }
    vector<Message> history(long beforeSeq, size_t limit) const {            // newest first, older than the cursor
        lock_guard l(m_); vector<Message> out;
        for (auto it = messages_.rbegin(); it != messages_.rend() && out.size() < limit; ++it) if (it->seq < beforeSeq) out.push_back(*it);
        return out;
    }
};

class DirectChat : public Chat {
    User *a_, *b_;
public:
    DirectChat(User* a, User* b) : Chat(a->name + "+" + b->name), a_(a), b_(b) {}
    vector<User*> members() const override { return {a_, b_}; }
};
class GroupChat : public Chat {
    vector<User*> members_; set<User*> admins_;
    mutable mutex gm_;                                        // guards membership (a SEPARATE lock: append() already holds the chat lock)
public:
    GroupChat(string name, User* owner, vector<User*> members) : Chat(move(name)), members_(move(members)) { admins_.insert(owner); if (find(members_.begin(), members_.end(), owner) == members_.end()) members_.push_back(owner); }
    vector<User*> members() const override { lock_guard l(gm_); return members_; }
    bool addMember(User* by, User* u) { lock_guard l(gm_); if (!admins_.count(by)) return false; if (find(members_.begin(), members_.end(), u) == members_.end()) members_.push_back(u); return true; }
    bool removeMember(User* by, User* u) { lock_guard l(gm_); if (!admins_.count(by)) return false; members_.erase(remove(members_.begin(), members_.end(), u), members_.end()); return true; }
};

class ChatServer {                                            // the Mediator
    vector<unique_ptr<User>> users_; vector<unique_ptr<Chat>> chats_; long clock_ = 0; mutex m_;
    void deliver(User* to, Chat& chat, long seq) {
        // the recipient's device receives it now
        to->onMessage(chat.title(), chat.message(seq));
        chat.setStatus(seq, to->name, Status::Delivered);
        for (User* u : chat.members()) if (u->name == chat.message(seq).sender && u->online) u->onStatus(chat.title(), seq, to->name, Status::Delivered);
    }
public:
    User* addUser(string n) { lock_guard l(m_); users_.push_back(make_unique<User>(move(n))); return users_.back().get(); }
    void tick() { lock_guard l(m_); ++clock_; }
    Chat* openDirect(User* a, User* b) { lock_guard l(m_); chats_.push_back(make_unique<DirectChat>(a, b)); return chats_.back().get(); }
    GroupChat* createGroup(User* owner, string name, vector<User*> members) { lock_guard l(m_); auto g = make_unique<GroupChat>(move(name), owner, move(members)); GroupChat* raw = g.get(); chats_.push_back(move(g)); return raw; }

    void connect(User* u) {
        u->online = true;
        cout << "  " << u->name << " comes online";
        if (!u->pending.empty()) cout << " (" << u->pending.size() << " waiting messages)";
        cout << "\n";
        sort(u->pending.begin(), u->pending.end(), [](auto& x, auto& y) { return x.second < y.second; });          // deliver in order
        auto queued = move(u->pending); u->pending.clear();
        for (auto& [chat, seq] : queued) deliver(u, *chat, seq);
    }
    void disconnect(User* u) { u->online = false; u->lastSeen = clock_; }

    bool send(User* from, Chat* chat, const string& text) {
        if (!chat->canSend(from)) { cout << "  " << from->name << " is not a member of " << chat->title() << ": message refused\n"; return false; }
        Message m = chat->append(*from, text, clock_);
        cout << "  " << from->name << " -> " << chat->title() << ": #" << m.seq << " '" << text << "' (sent)\n";
        for (User* to : chat->members()) {
            if (to == from) continue;
            if (to->online) deliver(to, *chat, m.seq);
            else to->pending.push_back({chat, m.seq});          // keep it until they connect
        }
        return true;
    }
    void markRead(User* u, Chat* chat) {
        long last = chat->lastSeq();
        for (long s = 1; s <= last; ++s) {
            const Message& m = chat->message(s);
            if (m.sender == u->name) continue;
            auto it = m.status.find(u->name);
            if (it == m.status.end() || it->second == Status::Read || it->second == Status::Sent) continue;       // only delivered messages become read
            chat->setStatus(s, u->name, Status::Read);
            for (User* sender : chat->members()) if (sender->name == m.sender && sender->online) sender->onStatus(chat->title(), s, u->name, Status::Read);
        }
    }
};

int main() {
    ChatServer server;
    User *asha = server.addUser("asha"), *ravi = server.addUser("ravi"), *meera = server.addUser("meera");
    server.connect(asha); server.connect(ravi);

    cout << "direct chat, both online:\n";
    Chat* ar = server.openDirect(asha, ravi);
    server.send(asha, ar, "hi ravi");
    server.markRead(ravi, ar);

    cout << "meera is offline; a group is created and messages are sent\n";
    GroupChat* g = server.createGroup(asha, "study-group", {asha, ravi, meera});
    server.send(asha, g, "exam on friday");
    server.send(ravi, g, "bring your notes");
    server.connect(meera);                                    // she gets both, in order
    server.markRead(meera, g);

    cout << "group rules:\n";
    cout << "  meera tries to remove ravi: " << boolalpha << g->removeMember(meera, ravi) << "\n";
    cout << "  asha removes ravi: " << g->removeMember(asha, ravi) << "\n";
    server.send(ravi, g, "can I still talk?");
    server.send(asha, g, "ravi has left");

    cout << "history, newest first, page size 2 (then the previous page):\n";
    auto page = g->history(1000, 2);
    for (auto& m : page) cout << "  #" << m.seq << " " << m.sender << ": " << m.text << "\n";
    auto older = g->history(page.back().seq, 2);
    for (auto& m : older) cout << "  (older) #" << m.seq << " " << m.sender << ": " << m.text << "\n";

    server.disconnect(meera);
    cout << "per-recipient status of #1 in the group: ravi=" << statusName(g->statusOf(1, "ravi")) << ", meera=" << statusName(g->statusOf(1, "meera")) << "\n";
}
```

## Edge cases

| Case | Handling |
|---|---|
| Recipient offline for days | the pending queue (a durable inbox in a real system) delivers on connect |
| Messages arriving out of order | the sequence number from the chat restores order |
| Same user on two devices | delivery per device; status = delivered when any device receives (extension) |
| Duplicate send after a retry | client sends an idempotency id; the server dedups |
| Member removed while messages are in flight | membership is checked at send time under the chat lock |
| Read receipts privacy | a per-user setting (a filter on `onStatus`) |
| Very large groups | fan-out on read (members pull from the chat's log) instead of write |
| Server crash | persist messages before acknowledging "sent" |

## Extensions and follow-ups

| Follow-up | Design response |
|---|---|
| "Typing indicators, presence updates" | ephemeral events through the same listener interface (not stored) |
| "Media messages" | `Message` has a payload variant (text, image reference); storage in an object store |
| "Edit/delete for everyone" | message revisions and tombstones; a command with a time limit |
| "Reply/forward/reactions" | fields on `Message`; reactions as a map user to emoji |
| "End-to-end encryption" | clients encrypt payloads; the server only routes ciphertext |
| "Scale to millions" | shard chats by id; the connection gateway layer is stateless; a message queue between layers (HLD) |
| "Search in chats" | an index per user; privacy constraints |
| "Push notifications" | a notification service for offline users (see that lesson) |

```quiz
? Why does each chat assign its own sequence numbers?
- To make ids shorter
+ A total order within the chat lets every client display and resume messages consistently
- Because the clock is wrong
> Sequences are stable cursors for history and delivery.
? Why track status per recipient?
- Memory is cheap
+ In a group each member can be at a different stage (delivered to some, read by others)
- For billing
> The sender sees "delivered to 3 of 5".
```

:::keypoints
- ChatServer is the Mediator; Chat owns ordered messages with per-chat sequence numbers; status per recipient.
- Offline users have a pending queue flushed in order on connect; read receipts flow back through listeners.
- Group rules (admins, membership checked at send time), cursor-based history, and idempotent sends.
:::
