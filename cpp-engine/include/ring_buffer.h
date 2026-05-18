#pragma once
#include <atomic>
#include <array>
#include <optional>
#include <cstddef>

// Lock-free single-producer single-consumer ring buffer
// Uses acquire/release memory ordering for cache-friendly cross-thread access
template<typename T, size_t Capacity>
class RingBuffer {
    static_assert((Capacity & (Capacity - 1)) == 0, "Capacity must be power of 2");

public:
    RingBuffer() : head_(0), tail_(0) {}

    // Producer: returns false if buffer is full
    bool push(const T& item) {
        const size_t curr_tail = tail_.load(std::memory_order_relaxed);
        const size_t next_tail = (curr_tail + 1) & mask_;
        if (next_tail == head_.load(std::memory_order_acquire))
            return false; // full
        buffer_[curr_tail] = item;
        tail_.store(next_tail, std::memory_order_release);
        return true;
    }

    bool push(T&& item) {
        const size_t curr_tail = tail_.load(std::memory_order_relaxed);
        const size_t next_tail = (curr_tail + 1) & mask_;
        if (next_tail == head_.load(std::memory_order_acquire))
            return false;
        buffer_[curr_tail] = std::move(item);
        tail_.store(next_tail, std::memory_order_release);
        return true;
    }

    // Consumer: returns nullopt if buffer is empty
    std::optional<T> pop() {
        const size_t curr_head = head_.load(std::memory_order_relaxed);
        if (curr_head == tail_.load(std::memory_order_acquire))
            return std::nullopt; // empty
        T item = std::move(buffer_[curr_head]);
        head_.store((curr_head + 1) & mask_, std::memory_order_release);
        return item;
    }

    bool empty() const {
        return head_.load(std::memory_order_acquire) ==
               tail_.load(std::memory_order_acquire);
    }

    size_t size() const {
        const size_t h = head_.load(std::memory_order_acquire);
        const size_t t = tail_.load(std::memory_order_acquire);
        return (t - h) & mask_;
    }

private:
    static constexpr size_t mask_ = Capacity - 1;
    std::array<T, Capacity> buffer_;
    alignas(64) std::atomic<size_t> head_;
    alignas(64) std::atomic<size_t> tail_;
};
