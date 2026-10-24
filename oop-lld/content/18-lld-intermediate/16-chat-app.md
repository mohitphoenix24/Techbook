---
title: Design a Chat Application (WhatsApp-like)
level: intermediate
time: 65
summary: Users, one-to-one and group chats, message status (sent, delivered, read), messages kept for offline users, who is online, chat history in pages, a chat server in the middle (Mediator), and how to keep the order of messages right.
---

:::problem Design a Chat Application {level=medium tags="Mediator,Observer,messaging,presence,state,groups"}
Design the core of a chat application. Users send messages to another user or to a group. Messages are delivered in order, show a **sent, delivered, read** status, and are kept until the receiver comes online. Show who is online, keep the chat history in pages, and support groups where members can be added and removed and there are admin rights.
:::

:::hint Hint
Users should not talk to each other directly. A **ChatServer** (the Mediator) carries the messages. A chat (conversation) owns an ordered list of messages. The delivery status is kept for each receiver. If a user is offline, their new messages wait in a queue and are delivered when they connect.
:::

## Step 1: Ask questions (requirements)

| Question | Our assumption |
|---|---|
| Chats? | one-to-one and group (many members) |
| Messages? | text with an id, sender, time, and a status for each receiver |
| Status? | Sent (the server has it), then Delivered (the receiver's device got it), then Read (the receiver opened the chat) |
| Offline users? | messages are kept and delivered when they connect, in order |
| Who is online? | online or offline, with a last-seen time |
| Groups? | admins can add and remove members. A removed member stops getting new messages |
| History? | get the last N messages, and older pages by a cursor |
| Order? | messages in a chat are in a fixed order by a number that the server gives |
| Many users? | many users send at once |
| Not needed | end-to-end encryption, pictures, push notifications, many devices for one user |

## Step 2: The status of a message

```viz algo=state title="Delivery status of one message to one recipient"
state Sent "Sent" [initial] @0,1
state Delivered "Delivered" @1,1
state Read "Read" @2,1
Sent -> Delivered : recipient online (or comes online)
Delivered -> Read : recipient opens the chat
play: recipient online (or comes online), recipient opens the chat
```

## Step 3: Find the classes

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

## Step 4: Design decisions

- **`ChatServer` is the Mediator.** Users call `send`. The server stores the message in the chat, and then **sends a copy to each member** (except the sender).
- **A sequence number for each chat**, given while holding the chat's lock, gives a total order. Every client uses it to show messages and to continue ("give me everything after number 42").
- **Delivery status for each receiver** (`map<User, Status>` inside the message). This is needed for groups ("delivered to 3 of 5").
- **An offline queue for each user.** If the receiver is offline, the delivery waits in the user's `pending` list. `connect()` sends it **in sequence order** and marks the messages Delivered.
- **Read receipts:** `markRead(user, chat)` marks everything up to the latest number as Read for that user, and tells the senders (Observer).
- **Group rules** are in `GroupChat`: only members can send, only admins can add or remove, and a removed member sees no new messages (their old history stays).
- **Locks:** one mutex for each chat for the numbers and statuses, and one for user presence and inbox. Listener calls happen after releasing the locks.
- **History in pages** by `(chat, beforeSeq, limit)`: steady cursors.

## Step 5: The code

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

| Case | What happens |
|---|---|
| The receiver is offline for days | the pending queue (a safe inbox in a real system) delivers when they connect |
| Messages arrive out of order | the sequence number from the chat puts them back in order |
| The same user on two devices | delivery for each device. Delivered when any device gets it (extension) |
| The same message sent twice after a retry | the client sends an idempotency id, and the server removes the duplicate |
| A member is removed while messages are on the way | membership is checked when sending, under the chat lock |
| Privacy of read receipts | a setting for each user (a filter on `onStatus`) |
| Very big groups | copy on read (members pull from the chat's log) instead of copy on write |
| The server crashes | save messages before saying "sent" |

## What if the interviewer asks for more?

| Follow-up | Our answer |
|---|---|
| "Typing signs, online updates" | short-lived events through the same listener interface (not stored) |
| "Pictures and files" | `Message` has a payload with a type (text, image link). Files go in an object store |
| "Edit or delete for everyone" | message versions and a "deleted" marker. A command with a time limit |
| "Reply, forward, reactions" | fields on `Message`. Reactions as a map from user to emoji |
| "End-to-end encryption" | clients encrypt the payload. The server only carries encrypted text |
| "Millions of users" | split chats by id. The connection layer holds no state. A message queue between layers (HLD) |
| "Search in chats" | an index for each user, with privacy rules |
| "Push notifications" | a notification service for offline users (see that lesson) |

## Short answer to say in an interview

:::interview How do you keep messages in order and show delivered and read?
"Users never talk to each other. A chat server, which is a Mediator, receives a message and stores it in the chat. Each chat gives its messages sequence numbers while holding its lock, so there is one clear order. Each message keeps a status for each receiver: sent, delivered or read, which is needed for groups. If a receiver is offline, the delivery waits in a pending queue, and when they connect it is sent in sequence order. Read receipts travel back to the sender through listeners."
:::

```quiz
? Why does each chat give its own sequence numbers?
- To make ids shorter
+ A fixed order inside the chat lets every client show and continue messages in the same way
- Because the clock is wrong
> Sequence numbers are steady cursors for history and delivery.
? Why keep the status for each receiver?
- Memory is cheap
+ In a group, each member can be at a different stage (delivered to some, read by others)
- For billing
> The sender sees "delivered to 3 of 5".
```

:::keypoints
- ChatServer is the Mediator. A chat owns ordered messages with sequence numbers. The status is kept for each receiver.
- Offline users have a pending queue that is sent in order when they connect. Read receipts go back through listeners.
- Group rules (admins, membership checked when sending), history in pages by cursor, and sends that are safe to repeat.
:::
