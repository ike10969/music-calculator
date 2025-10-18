class MusicCalculator {
    constructor() {
        this.audioContext = null;
        this.masterGainNode = null;
        this.activeOscillators = new Map(); // 存储当前活动的振荡器
        this.currentPitch = 0; // 音调偏移（半音数）
        this.volume = 0.8;
        this.longPressTimers = new Map(); // 存储每个按钮的长按计时器
        this.lastPlayedNote = null; // 记录最后播放的音符
        this.isDragging = false; // 是否正在拖动
        this.currentDragButton = null; // 当前拖动的按钮
        
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
            this.masterGainNode = this.audioContext.createGain();
            this.masterGainNode.connect(this.audioContext.destination);
            this.masterGainNode.gain.value = this.volume;
            
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

        // 添加滑动事件监听
        this.addSwipeEvents();

        // 功能按钮事件
        document.getElementById('sharp-btn').addEventListener('click', () => this.sharpPitch());
        document.getElementById('flat-btn').addEventListener('click', () => this.flatPitch());
        document.getElementById('clear-btn').addEventListener('click', () => this.clearPitch());

        // 音量控制
        document.getElementById('volume-slider').addEventListener('input', (e) => {
            this.volume = e.target.value / 100;
            if (this.masterGainNode) {
                this.masterGainNode.gain.value = this.volume;
            }
            this.updateVolumeDisplay();
        });

        // 为每个按钮添加单独的释放事件
        document.querySelectorAll('.note-btn').forEach(button => {
            button.addEventListener('mouseup', (e) => {
                e.stopPropagation(); // 阻止事件冒泡
                const note = button.dataset.note;
                this.stopSingleSound(note);
            });
            button.addEventListener('touchend', (e) => {
                e.stopPropagation(); // 阻止事件冒泡
                const note = button.dataset.note;
                this.stopSingleSound(note);
            });
            // 移除mouseleave事件，因为它会干扰滑动功能
        });

        // 全局停止事件（用于清除所有声音）
        document.addEventListener('mouseup', () => {
            // 不在这里处理单个音符停止，由按钮事件处理
        });
        document.addEventListener('touchend', () => {
            // 不在这里处理单个音符停止，由按钮事件处理
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
        event.stopPropagation(); // 阻止事件冒泡
        const button = event.target.closest('.note-btn');
        if (!button) return;

        // 如果正在拖动，不处理点击事件
        if (this.isDragging) return;

        const note = button.dataset.note;
        const baseFrequency = parseFloat(button.dataset.frequency);
        
        this.playSound(baseFrequency, note, button);
        this.startLongPress(button, baseFrequency, note);
    }

    playSound(frequency, note, button) {
        const noteId = note; // 使用音符名称作为唯一标识

        // 如果该音符已经在播放，先停止它
        if (this.activeOscillators.has(noteId)) {
            this.stopSingleSound(noteId);
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
            
            // 创建新的振荡器和增益节点
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            oscillator.type = 'sine'; // 正弦波，音色更纯净
            oscillator.frequency.value = actualFrequency;
            
            // 连接到主增益节点
            oscillator.connect(gainNode);
            gainNode.connect(this.masterGainNode);
            
            // 淡入效果
            const now = this.audioContext.currentTime;
            gainNode.gain.setValueAtTime(0, now);
            gainNode.gain.linearRampToValueAtTime(this.volume, now + 0.02);
            
            oscillator.start();
            
            // 存储振荡器和增益节点
            this.activeOscillators.set(noteId, {
                oscillator: oscillator,
                gainNode: gainNode,
                frequency: actualFrequency,
                button: button
            });
            
            this.updateChordDisplay();
            this.addPlayingEffect(button);
            
        } catch (error) {
            console.error('播放声音失败:', error);
            this.showError('音频播放失败，请刷新页面重试');
        }
    }

    stopSound() {
        // 停止所有长按计时器
        this.longPressTimers.forEach((timer, noteId) => {
            clearTimeout(timer);
        });
        this.longPressTimers.clear();

        // 停止所有振荡器
        this.activeOscillators.forEach((sound, noteId) => {
            this.stopSingleSound(noteId);
        });
    }

    stopSingleSound(noteId) {
        const sound = this.activeOscillators.get(noteId);
        if (sound) {
            try {
                console.log('停止单个声音:', noteId);
                // 清除该音符的长按计时器
                if (this.longPressTimers.has(noteId)) {
                    clearTimeout(this.longPressTimers.get(noteId));
                    this.longPressTimers.delete(noteId);
                }

                // 立即停止声音，不使用淡出效果
                try {
                    sound.oscillator.stop();
                    sound.oscillator.disconnect();
                    sound.gainNode.disconnect();
                    this.activeOscillators.delete(noteId);
                    this.removePlayingEffect(sound.button);
                    this.updateChordDisplay();
                } catch (error) {
                    console.error('清理振荡器失败:', error);
                }
                
            } catch (error) {
                console.error('停止单个声音失败:', error);
            }
        }
    }

    startLongPress(button, frequency, note) {
        const noteId = note;
        
        // 清除现有的计时器
        if (this.longPressTimers.has(noteId)) {
            clearTimeout(this.longPressTimers.get(noteId));
        }

        const timer = setTimeout(() => {
            // 长按时保持声音持续播放
            if (this.activeOscillators.has(noteId)) {
                this.addPlayingEffect(button);
            }
        }, 500);
        
        this.longPressTimers.set(noteId, timer);
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

    updateChordDisplay() {
        const currentNote = document.querySelector('.current-note');
        const frequencyDisplay = document.querySelector('.frequency-display');
        
        if (this.activeOscillators.size === 0) {
            currentNote.textContent = '准备播放';
            frequencyDisplay.textContent = '频率: 0Hz';
        } else if (this.activeOscillators.size === 1) {
            // 单个音符
            const sound = Array.from(this.activeOscillators.values())[0];
            const pitchName = this.getPitchName();
            currentNote.textContent = `${Object.keys(this.noteFrequencies).find(key => this.noteFrequencies[key] === sound.frequency / Math.pow(2, this.currentPitch / 12))} (${pitchName})`;
            frequencyDisplay.textContent = `频率: ${sound.frequency.toFixed(2)}Hz`;
        } else {
            // 和弦显示
            const activeNotes = Array.from(this.activeOscillators.keys()).sort();
            currentNote.textContent = `和弦: ${activeNotes.join('+')}`;
            frequencyDisplay.textContent = `同时播放: ${this.activeOscillators.size}个音符`;
        }
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

    removePlayingEffect(button) {
        button.classList.remove('playing');
    }

    removeAllPlayingEffects() {
        document.querySelectorAll('.note-btn').forEach(btn => {
            btn.classList.remove('playing');
        });
    }

    showError(message) {
        const displayArea = document.querySelector('.display-area');
        displayArea.innerHTML = `<div style="color: #ff4444; text-align: center;">${message}</div>`;
    }

    // 添加滑动事件处理 - 最终版本
    addSwipeEvents() {
        console.log('初始化滑动事件');
        
        // 为每个按钮添加鼠标按下和移动事件
        document.querySelectorAll('.note-btn').forEach(button => {
            // 鼠标按下事件
            button.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('鼠标按下:', button.dataset.note);
                this.isDragging = true;
                this.lastPlayedNote = button.dataset.note;
                const baseFrequency = parseFloat(button.dataset.frequency);
                this.playSound(baseFrequency, button.dataset.note, button);
            });

            // 鼠标进入事件（用于滑动切换）
            button.addEventListener('mouseenter', (e) => {
                if (this.isDragging) {
                    console.log('鼠标进入新按钮:', button.dataset.note);
                    const note = button.dataset.note;
                    const baseFrequency = parseFloat(button.dataset.frequency);
                    
                    if (note !== this.lastPlayedNote) {
                        this.lastPlayedNote = note;
                        this.stopSound();
                        this.playSound(baseFrequency, note, button);
                    }
                }
            });

            // 鼠标离开事件（停止离开按钮的声音）
            button.addEventListener('mouseleave', (e) => {
                if (this.isDragging) {
                    console.log('鼠标离开按钮:', button.dataset.note);
                    // 停止当前按钮的声音
                    const note = button.dataset.note;
                    this.stopSingleSound(note);
                }
            });
        });

        // 全局鼠标释放事件
        document.addEventListener('mouseup', (e) => {
            if (this.isDragging) {
                console.log('全局鼠标释放');
                this.stopSound();
            }
            this.isDragging = false;
            this.lastPlayedNote = null;
        });

        // 防止鼠标释放事件冒泡到按钮
        document.querySelectorAll('.note-btn').forEach(button => {
            button.addEventListener('mouseup', (e) => {
                e.stopPropagation();
            });
        });

        // 触摸事件 - 修复版本
        let touchStartButton = null;
        
        // 为每个按钮添加触摸开始事件
        document.querySelectorAll('.note-btn').forEach(button => {
            button.addEventListener('touchstart', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('触摸开始:', button.dataset.note);
                touchStartButton = button;
                this.isDragging = true;
                this.lastPlayedNote = button.dataset.note;
                const baseFrequency = parseFloat(button.dataset.frequency);
                this.playSound(baseFrequency, button.dataset.note, button);
            }, { passive: false });
        });

        // 全局触摸移动事件
        document.addEventListener('touchmove', (e) => {
            if (!this.isDragging) return;
            e.preventDefault();
            
            const touch = e.touches[0];
            const hoveredElement = document.elementFromPoint(touch.clientX, touch.clientY);
            const noteButton = hoveredElement?.closest('.note-btn');
            
            if (noteButton && noteButton !== touchStartButton) {
                const note = noteButton.dataset.note;
                const baseFrequency = parseFloat(noteButton.dataset.frequency);
                
                if (note !== this.lastPlayedNote) {
                    console.log('触摸滑动切换到新音符:', note);
                    this.lastPlayedNote = note;
                    this.stopSound();
                    this.playSound(baseFrequency, note, noteButton);
                    touchStartButton = noteButton;
                }
            }
        }, { passive: false });

        document.addEventListener('touchend', (e) => {
            if (this.isDragging) {
                console.log('触摸结束，停止声音');
                this.stopSound();
            }
            this.isDragging = false;
            this.lastPlayedNote = null;
            touchStartButton = null;
        });
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