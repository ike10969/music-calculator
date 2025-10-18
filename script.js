class MusicCalculator {
    constructor() {
        this.audioContext = null;
        this.oscillator = null;
        this.gainNode = null;
        this.isPlaying = false;
        this.currentPitch = 0; // 音调偏移（半音数）
        this.volume = 0.8;
        this.longPressTimer = null;
        
        this.noteFrequencies = {
            'C4': 261.63, 'D4': 293.66, 'E4': 329.63,
            'F4': 349.23, 'G4': 392.00, 'A4': 440.00,
            'C5': 523.25, 'D5': 587.33, 'E5': 659.25
        };
        
        this.init();
    }

    init() {
        this.initAudioContext();
        this.bindEvents();
        this.updateDisplay();
    }

    initAudioContext() {
        try {
            // 检查浏览器支持
            if (!window.AudioContext && !window.webkitAudioContext) {
                throw new Error('浏览器不支持Web Audio API');
            }
            
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.gainNode = this.audioContext.createGain();
            this.gainNode.connect(this.audioContext.destination);
            this.gainNode.gain.value = this.volume;
            
            // 处理iOS Safari的自动播放限制
            if (this.audioContext.state === 'suspended') {
                const resumeAudio = () => {
                    this.audioContext.resume();
                    document.removeEventListener('touchstart', resumeAudio);
                    document.removeEventListener('click', resumeAudio);
                };
                document.addEventListener('touchstart', resumeAudio, { once: true });
                document.addEventListener('click', resumeAudio, { once: true });
            }
        } catch (error) {
            console.error('音频上下文初始化失败:', error);
            this.showError('浏览器不支持音频功能，请使用Chrome、Firefox或Safari等现代浏览器');
        }
    }

    bindEvents() {
        // 音符按钮事件
        document.querySelectorAll('.note-btn').forEach(button => {
            button.addEventListener('mousedown', (e) => this.handleNotePress(e));
            button.addEventListener('touchstart', (e) => this.handleNotePress(e));
            
            button.addEventListener('mouseup', () => this.stopSound());
            button.addEventListener('touchend', () => this.stopSound());
            button.addEventListener('mouseleave', () => this.stopSound());
        });

        // 功能按钮事件
        document.getElementById('sharp-btn').addEventListener('click', () => this.sharpPitch());
        document.getElementById('flat-btn').addEventListener('click', () => this.flatPitch());
        document.getElementById('clear-btn').addEventListener('click', () => this.clearPitch());

        // 音量控制
        document.getElementById('volume-slider').addEventListener('input', (e) => {
            this.volume = e.target.value / 100;
            if (this.gainNode) {
                this.gainNode.gain.value = this.volume;
            }
            this.updateVolumeDisplay();
        });

        // 防止移动端默认行为
        document.addEventListener('touchstart', (e) => {
            if (e.target.classList.contains('calc-btn')) {
                e.preventDefault();
            }
        }, { passive: false });
    }

    handleNotePress(event) {
        event.preventDefault();
        const button = event.target.closest('.note-btn');
        if (!button) return;

        const note = button.dataset.note;
        const baseFrequency = parseFloat(button.dataset.frequency);
        
        this.playSound(baseFrequency, note);
        this.startLongPress(button, baseFrequency, note);
    }

    playSound(frequency, note) {
        // 移除停止当前声音的逻辑，允许长按平滑过渡
        // 如果正在播放，直接使用当前振荡器
        if (this.isPlaying && this.oscillator) {
            // 只更新频率，不重新创建振荡器
            const actualFrequency = this.calculateFrequency(frequency);
            this.oscillator.frequency.setValueAtTime(actualFrequency, this.audioContext.currentTime);
            this.updateNoteDisplay(note, actualFrequency);
            return;
        }

        if (!this.audioContext) {
            this.initAudioContext();
        }

        // 确保音频上下文已恢复
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume().catch(error => {
                console.error('音频上下文恢复失败:', error);
                this.showError('请点击页面任意位置激活音频功能');
                return;
            });
        }

        try {
            // 应用音调偏移
            const actualFrequency = this.calculateFrequency(frequency);
            
            this.oscillator = this.audioContext.createOscillator();
            this.oscillator.type = 'sine'; // 正弦波，音色更纯净
            this.oscillator.frequency.value = actualFrequency;
            
            this.gainNode = this.audioContext.createGain();
            this.oscillator.connect(this.gainNode);
            this.gainNode.connect(this.audioContext.destination);
            
            // 淡入效果
            const now = this.audioContext.currentTime;
            this.gainNode.gain.setValueAtTime(0, now);
            this.gainNode.gain.linearRampToValueAtTime(this.volume, now + 0.02);
            
            this.oscillator.start();
            this.isPlaying = true;
            
            this.updateNoteDisplay(note, actualFrequency);
            this.addPlayingEffect(event.target.closest('.note-btn'));
            
        } catch (error) {
            console.error('播放声音失败:', error);
            this.showError('音频播放失败，请刷新页面重试');
        }
    }

    stopSound() {
        if (this.longPressTimer) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }

        if (this.isPlaying && this.oscillator && this.gainNode) {
            try {
                // 立即停止声音，移除淡出效果
                this.gainNode.gain.cancelScheduledValues(this.audioContext.currentTime);
                this.gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
                
                this.oscillator.stop();
                this.oscillator.disconnect();
                this.oscillator = null;
                this.isPlaying = false;
                this.removePlayingEffect();
                
            } catch (error) {
                console.error('停止声音失败:', error);
            }
        }
    }

    startLongPress(button, frequency, note) {
        this.longPressTimer = setTimeout(() => {
            if (this.isPlaying) {
                // 长按时不重新播放，而是保持当前声音持续
                // 只需要更新显示效果，避免声音中断
                this.addPlayingEffect(button);
            }
        }, 500);
    }

    calculateFrequency(baseFrequency) {
        // 根据音调偏移计算实际频率（半音偏移）
        return baseFrequency * Math.pow(2, this.currentPitch / 12);
    }

    sharpPitch() {
        this.currentPitch += 1;
        this.updatePitchDisplay();
    }

    flatPitch() {
        this.currentPitch -= 1;
        this.updatePitchDisplay();
    }

    clearPitch() {
        this.currentPitch = 0;
        this.updatePitchDisplay();
        this.stopSound();
    }

    updateDisplay() {
        this.updatePitchDisplay();
        this.updateVolumeDisplay();
    }

    updatePitchDisplay() {
        const pitchDisplay = document.querySelector('.pitch-display');
        const pitchName = this.getPitchName();
        pitchDisplay.textContent = `音调: ${pitchName}`;
    }

    updateVolumeDisplay() {
        const volumeIndicator = document.querySelector('.volume-indicator');
        const volumePercent = Math.round(this.volume * 100);
        volumeIndicator.textContent = `音量: ${volumePercent}%`;
    }

    updateNoteDisplay(note, frequency) {
        const currentNote = document.querySelector('.current-note');
        const frequencyDisplay = document.querySelector('.frequency-display');
        
        const pitchName = this.getPitchName();
        currentNote.textContent = `${note} (${pitchName})`;
        frequencyDisplay.textContent = `频率: ${frequency.toFixed(2)}Hz`;
    }

    getPitchName() {
        const baseNote = 'C';
        const baseOctave = 4;
        
        // 计算实际音高
        const totalSemitones = this.currentPitch;
        const noteIndex = (totalSemitones % 12 + 12) % 12;
        const octaveOffset = Math.floor(totalSemitones / 12);
        
        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const actualOctave = baseOctave + octaveOffset;
        
        return `${noteNames[noteIndex]}${actualOctave}`;
    }

    addPlayingEffect(button) {
        button.classList.add('playing');
    }

    removePlayingEffect() {
        document.querySelectorAll('.note-btn').forEach(btn => {
            btn.classList.remove('playing');
        });
    }

    showError(message) {
        const displayArea = document.querySelector('.display-area');
        displayArea.innerHTML = `<div style="color: #ff4444; text-align: center;">${message}</div>`;
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    new MusicCalculator();
});

// 处理移动端触摸事件的默认行为
document.addEventListener('touchmove', (e) => {
    if (e.target.classList.contains('calc-btn')) {
        e.preventDefault();
    }
}, { passive: false });

// 处理页面失去焦点时停止声音
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        const calculator = window.musicCalculator;
        if (calculator) {
            calculator.stopSound();
        }
    }
});

// 全局引用，方便调试
window.musicCalculator = new MusicCalculator();