"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RoomParticipantDTO } from "@/lib/game-types";
import type { RoomRealtimeTransport } from "@/lib/realtime-client";

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export interface VoicePeerActivity {
  speaking: boolean;
  connected: boolean;
}

export function useVoiceChat(opts: {
  roomCode: string;
  myUserId: number | null;
  participants: RoomParticipantDTO[];
  transportRef: React.MutableRefObject<RoomRealtimeTransport | null>;
}) {
  const { roomCode, myUserId, participants, transportRef } = opts;

  const [voiceJoined, setVoiceJoined] = useState(false);
  const [listenOnly, setListenOnly] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [peerSpeakingMap, setPeerSpeakingMap] = useState<
    Record<number, VoicePeerActivity>
  >({});

  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<number, RTCPeerConnection>>(new Map());
  const remoteAudioRef = useRef<Map<number, HTMLAudioElement>>(new Map());
  const pendingIceRef = useRef<Map<number, RTCIceCandidateInit[]>>(new Map());
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const isSpeakingRef = useRef(false);
  const voiceJoinedRef = useRef(false);
  const isMutedRef = useRef(false);
  const isDeafenedRef = useRef(false);

  useEffect(() => {
    voiceJoinedRef.current = voiceJoined;
  }, [voiceJoined]);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    isDeafenedRef.current = isDeafened;
    remoteAudioRef.current.forEach((audioEl) => {
      audioEl.muted = isDeafened;
    });
  }, [isDeafened]);

  const closePeer = useCallback((peerId: number) => {
    const pc = peersRef.current.get(peerId);
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pc.close();
      peersRef.current.delete(peerId);
    }
    const audioEl = remoteAudioRef.current.get(peerId);
    if (audioEl) {
      audioEl.srcObject = null;
      audioEl.remove();
      remoteAudioRef.current.delete(peerId);
    }
    pendingIceRef.current.delete(peerId);
    setPeerSpeakingMap((prev) => {
      const next = { ...prev };
      delete next[peerId];
      return next;
    });
  }, []);

  const ensurePeerConnection = useCallback(
    (peerId: number): RTCPeerConnection => {
      const existing = peersRef.current.get(peerId);
      if (existing) return existing;

      const pc = new RTCPeerConnection(RTC_CONFIG);
      peersRef.current.set(peerId, pc);

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current!);
        });
      }

      pc.onicecandidate = (ev) => {
        if (ev.candidate && transportRef.current) {
          void transportRef.current.sendRtcSignal({
            toUserId: peerId,
            signalType: "ice",
            payload: JSON.stringify(ev.candidate),
          });
        }
      };

      pc.ontrack = (ev) => {
        const [stream] = ev.streams;
        if (!stream) return;
        let audioEl = remoteAudioRef.current.get(peerId);
        if (!audioEl) {
          audioEl = document.createElement("audio");
          audioEl.autoplay = true;
          audioEl.setAttribute("playsinline", "true");
          audioEl.muted = isDeafenedRef.current;
          remoteAudioRef.current.set(peerId, audioEl);
        }
        audioEl.srcObject = stream;
        void audioEl.play().catch(() => {
          // autoplay policy fallback on next interaction
        });
        setPeerSpeakingMap((prev) => ({
          ...prev,
          [peerId]: {
            speaking: prev[peerId]?.speaking ?? false,
            connected: true,
          },
        }));
      };

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        if (state === "connected") {
          setPeerSpeakingMap((prev) => ({
            ...prev,
            [peerId]: {
              speaking: prev[peerId]?.speaking ?? false,
              connected: true,
            },
          }));
        } else if (state === "failed" || state === "closed") {
          closePeer(peerId);
        }
      };

      return pc;
    },
    [closePeer, transportRef]
  );

  const handleIncomingSignal = useCallback(
    async (msg: {
      fromUserId: number;
      signalType: "offer" | "answer" | "ice";
      payload: string;
    }) => {
      if (!voiceJoinedRef.current || !myUserId || msg.fromUserId === myUserId) {
        return;
      }

      try {
        const pc = ensurePeerConnection(msg.fromUserId);

        if (msg.signalType === "offer") {
          const offer = JSON.parse(msg.payload) as RTCSessionDescriptionInit;
          await pc.setRemoteDescription(new RTCSessionDescription(offer));

          const buffered = pendingIceRef.current.get(msg.fromUserId) || [];
          for (const cand of buffered) {
            await pc.addIceCandidate(new RTCIceCandidate(cand));
          }
          pendingIceRef.current.delete(msg.fromUserId);

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await transportRef.current?.sendRtcSignal({
            toUserId: msg.fromUserId,
            signalType: "answer",
            payload: JSON.stringify(answer),
          });
        } else if (msg.signalType === "answer") {
          const answer = JSON.parse(msg.payload) as RTCSessionDescriptionInit;
          if (pc.signalingState !== "stable") {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
          }
          const buffered = pendingIceRef.current.get(msg.fromUserId) || [];
          for (const cand of buffered) {
            await pc.addIceCandidate(new RTCIceCandidate(cand));
          }
          pendingIceRef.current.delete(msg.fromUserId);
        } else if (msg.signalType === "ice") {
          const cand = JSON.parse(msg.payload) as RTCIceCandidateInit;
          if (pc.remoteDescription) {
            await pc.addIceCandidate(new RTCIceCandidate(cand));
          } else {
            const list = pendingIceRef.current.get(msg.fromUserId) || [];
            list.push(cand);
            pendingIceRef.current.set(msg.fromUserId, list);
          }
        }
      } catch (err) {
        console.warn("WebRTC signal handling warning:", err);
      }
    },
    [ensurePeerConnection, myUserId, transportRef]
  );

  const handlePeerVoiceState = useCallback(
    (msg: {
      userId: number;
      voiceEnabled: boolean;
      isMuted: boolean;
      speaking?: boolean;
    }) => {
      if (msg.userId === myUserId) return;
      setPeerSpeakingMap((prev) => ({
        ...prev,
        [msg.userId]: {
          speaking: Boolean(msg.speaking) && !msg.isMuted && msg.voiceEnabled,
          connected: prev[msg.userId]?.connected ?? false,
        },
      }));
      if (!msg.voiceEnabled) {
        closePeer(msg.userId);
      }
    },
    [closePeer, myUserId]
  );

  // Sync peer offers when voice-enabled participants change
  useEffect(() => {
    if (!voiceJoined || !myUserId) return;

    const voicePeers = participants.filter(
      (p) => p.voiceEnabled && p.userId !== myUserId
    );
    const activeIds = new Set(voicePeers.map((p) => p.userId));

    // Close dropped peers
    for (const existingId of peersRef.current.keys()) {
      if (!activeIds.has(existingId)) {
        closePeer(existingId);
      }
    }

    // Deterministic initiator: lower userId creates offer
    for (const peer of voicePeers) {
      if (myUserId < peer.userId && !peersRef.current.has(peer.userId)) {
        const pc = ensurePeerConnection(peer.userId);
        void (async () => {
          try {
            const offer = await pc.createOffer({
              offerToReceiveAudio: true,
            });
            await pc.setLocalDescription(offer);
            await transportRef.current?.sendRtcSignal({
              toUserId: peer.userId,
              signalType: "offer",
              payload: JSON.stringify(offer),
            });
          } catch (err) {
            console.warn("Offer error:", err);
          }
        })();
      }
    }
  }, [
    voiceJoined,
    myUserId,
    participants,
    closePeer,
    ensurePeerConnection,
    transportRef,
  ]);

  const leaveVoice = useCallback(async () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (audioCtxRef.current) {
      void audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    for (const peerId of Array.from(peersRef.current.keys())) {
      closePeer(peerId);
    }
    setVoiceJoined(false);
    setListenOnly(false);
    setMicLevel(0);
    setIsSpeaking(false);
    isSpeakingRef.current = false;

    await transportRef.current?.sendVoiceState({
      voiceEnabled: false,
      isMuted: false,
      speaking: false,
    });
  }, [closePeer, transportRef]);

  const joinVoice = useCallback(async () => {
    if (!myUserId) return;
    setVoiceError(null);
    let stream: MediaStream | null = null;
    let isListenOnlyMode = false;

    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      } else {
        isListenOnlyMode = true;
      }
    } catch {
      isListenOnlyMode = true;
      setVoiceError(
        "Microphone unavailable or denied — joined Voice Channel in Listen-Only mode."
      );
    }

    localStreamRef.current = stream;
    setListenOnly(isListenOnlyMode);
    setIsMuted(isListenOnlyMode);
    setVoiceJoined(true);
    voiceJoinedRef.current = true;

    if (stream) {
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          audioCtxRef.current = ctx;
          const src = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          src.connect(analyser);
          const data = new Uint8Array(analyser.frequencyBinCount);
          let lastEmit = 0;

          const tick = () => {
            if (!voiceJoinedRef.current) return;
            analyser.getByteFrequencyData(data);
            let sum = 0;
            for (let i = 0; i < data.length; i++) sum += data[i];
            const avg = sum / data.length;
            const norm = isMutedRef.current ? 0 : Math.min(100, Math.round(avg * 2.2));
            setMicLevel(norm);

            const speakingNow = norm > 14 && !isMutedRef.current;
            if (speakingNow !== isSpeakingRef.current) {
              isSpeakingRef.current = speakingNow;
              setIsSpeaking(speakingNow);
              const now = Date.now();
              if (now - lastEmit > 160) {
                lastEmit = now;
                void transportRef.current?.sendVoiceState({
                  voiceEnabled: true,
                  isMuted: isMutedRef.current,
                  speaking: speakingNow,
                });
              }
            }
            rafRef.current = requestAnimationFrame(tick);
          };
          rafRef.current = requestAnimationFrame(tick);
        }
      } catch {
        // non-fatal meter setup
      }
    }

    await transportRef.current?.sendVoiceState({
      voiceEnabled: true,
      isMuted: isListenOnlyMode,
      speaking: false,
    });

    // Pull any pending signals sent just before joining
    try {
      const res = await fetch(`/api/rooms/${roomCode}/sync`);
      if (res.ok) {
        const json = (await res.json()) as {
          signals?: Array<{
            fromUserId: number;
            signalType: "offer" | "answer" | "ice";
            payload: string;
          }>;
        };
        for (const sig of json.signals || []) {
          await handleIncomingSignal(sig);
        }
      }
    } catch {
      // ignore
    }
  }, [handleIncomingSignal, myUserId, roomCode, transportRef]);

  const toggleMute = useCallback(async () => {
    if (!voiceJoined) return;
    if (listenOnly) return;
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((t) => {
        t.enabled = !nextMuted;
      });
    }
    if (nextMuted) {
      setIsSpeaking(false);
      isSpeakingRef.current = false;
    }
    await transportRef.current?.sendVoiceState({
      voiceEnabled: true,
      isMuted: nextMuted,
      speaking: false,
    });
  }, [isMuted, listenOnly, transportRef, voiceJoined]);

  const toggleDeafen = useCallback(() => {
    setIsDeafened((prev) => !prev);
  }, []);

  useEffect(() => {
    return () => {
      if (voiceJoinedRef.current) {
        void leaveVoice();
      }
    };
  }, [leaveVoice]);

  return {
    voiceJoined,
    listenOnly,
    isMuted,
    isDeafened,
    micLevel,
    isSpeaking,
    voiceError,
    peerSpeakingMap,
    joinVoice,
    leaveVoice,
    toggleMute,
    toggleDeafen,
    handleIncomingSignal,
    handlePeerVoiceState,
  };
}
