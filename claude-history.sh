#!/bin/bash

# Claude History Server Management Script
# Unique name to prevent conflicts with other Claude instances

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$SCRIPT_DIR/logs/claude-history-server.pid"
LOG_FILE="$SCRIPT_DIR/logs/claude-history-server.log"
PORT=3100

case "$1" in
    start)
        if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
            echo "🔥 Claude History Server уже запущен (PID: $(cat "$PID_FILE"))"
            echo "🌐 http://localhost:$PORT"
        else
            echo "🚀 Запуск Claude History Server..."
            cd "$SCRIPT_DIR"
            mkdir -p logs
            PORT=$PORT nohup node api/server.js > "$LOG_FILE" 2>&1 &
            echo $! > "$PID_FILE"
            sleep 2
            if kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
                echo "✅ Запущен успешно (PID: $(cat "$PID_FILE"))"
                echo "🌐 Интерфейс: http://localhost:$PORT"
                echo "📊 Граф: http://localhost:$PORT/graph.html"
            else
                echo "❌ Ошибка запуска. Проверь логи: $LOG_FILE"
            fi
        fi
        ;;
    stop)
        if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
            echo "🛑 Остановка Claude History Server..."
            kill "$(cat "$PID_FILE")"
            rm -f "$PID_FILE"
            echo "✅ Остановлен"
        else
            echo "❌ Claude History Server не запущен"
        fi
        ;;
    status)
        if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
            echo "✅ Claude History Server работает (PID: $(cat "$PID_FILE"))"
            echo "🌐 http://localhost:$PORT"
            curl -s "http://localhost:$PORT/stats" | head -1
        else
            echo "❌ Claude History Server не запущен"
        fi
        ;;
    logs)
        if [ -f "$LOG_FILE" ]; then
            echo "📋 Логи Claude History Server:"
            tail -20 "$LOG_FILE"
        else
            echo "❌ Файл логов не найден: $LOG_FILE"
        fi
        ;;
    restart)
        $0 stop
        sleep 2
        $0 start
        ;;
    *)
        echo "🧠 Claude History Server Management"
        echo ""
        echo "Использование: $0 {start|stop|status|logs|restart}"
        echo ""
        echo "  start   - Запустить сервер в фоне (порт $PORT)"
        echo "  stop    - Остановить сервер"  
        echo "  status  - Проверить статус"
        echo "  logs    - Показать последние логи"
        echo "  restart - Перезапустить сервер"
        echo ""
        echo "🌐 После запуска: http://localhost:$PORT"
        exit 1
esac