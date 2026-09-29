#!/usr/bin/env bash
# End-to-end exercise of TokenLocker + TokenVesting on live Arc using cast.
# Usage: PRIVATE_KEY=0x.. ./script/e2e-arc.sh <LOCKER> <VESTING> <TOKEN>
# Uses short durations (minutes) and a throwaway second wallet to test role transfers.
set -u
export PATH="$PATH:$HOME/.foundry/bin"

LOCKER=$1; VEST=$2; TOKEN=$3
R=${ARC_RPC_URL:-https://rpc.arc-scan.org}
PK=$(echo "$PRIVATE_KEY" | tr -d ' \r"'"'"''); case "$PK" in 0x*) ;; *) PK="0x$PK";; esac
ME=$(cast wallet address --private-key "$PK")
FEE=100000000000000000            # 0.1 USDC
ONE=1000000000000000000           # 1 token (18 dec)

PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  ✅ $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  ❌ $1"; }
hr()   { echo; echo "── $1 ──"; }
# Big-integer helpers (token amounts exceed bash's 64-bit integers). Requires node.
big() { node -e 'const [a,op,b]=process.argv.slice(1);const x=BigInt(a),y=BigInt(b);const r={"==":x===y,">":x>y,"<":x<y,">=":x>=y,"<=":x<=y}[op];process.exit(r?0:1)' "$1" "$2" "$3"; }
sub() { node -e 'console.log((BigInt(process.argv[1])-BigInt(process.argv[2])).toString())' "$1" "$2"; }
# Retry any cast call that dies on the flaky public RPC (503 "unreachable").
rpc_retry() { # rpc_retry <max> <cmd...>
  local max=$1; shift; local i out
  for i in $(seq 1 "$max"); do
    out=$("$@" 2>&1)
    if echo "$out" | grep -qE 'HTTP error 503|unreachable|Max retries exceeded|failed to retrieve chain ID'; then echo "  … RPC 503, retry $i/$max in 10s" >&2; sleep 10; continue; fi
    echo "$out"; return 0
  done
  echo "$out"; return 1
}
# send <desc> <from-pk> <to> <sig> [args...] ; value via VALUE env
send() {
  local desc=$1 pk=$2 to=$3 sig=$4; shift 4
  local out status
  out=$(rpc_retry 12 cast send "$to" "$sig" "$@" --private-key "$pk" --rpc-url "$R" --value "${VALUE:-0}" --json)
  status=$(echo "$out" | grep -oE '"status": *"0x[01]"' | grep -oE '0x[01]')
  if [ "$status" = "0x1" ]; then ok "$desc"; LAST_TX=$(echo "$out" | grep -oE '"transactionHash": *"0x[0-9a-f]+"' | grep -oE '0x[0-9a-f]+'); return 0
  else bad "$desc :: $(echo "$out" | grep -oE 'message":"[^"]{0,160}|custom error[^\n]{0,160}|execution reverted[^\n]{0,120}' | head -1)"; return 1; fi
}
# expect_revert <desc> <pk> <to> <sig> [args...]
expect_revert() {
  local desc=$1 pk=$2 to=$3 sig=$4; shift 4
  local out
  out=$(rpc_retry 12 cast send "$to" "$sig" "$@" --private-key "$pk" --rpc-url "$R" --value "${VALUE:-0}" --json)
  if echo "$out" | grep -q '"status": *"0x1"'; then bad "$desc :: did NOT revert (tx succeeded)"
  elif echo "$out" | grep -qE 'HTTP error 503|unreachable'; then bad "$desc :: RPC down, could not test"
  else ok "$desc (reverted as expected: $(echo "$out" | grep -oE 'custom error [^ ]+|execution reverted[^"]{0,60}|0x[0-9a-f]{8}' | head -1))"; fi
}
call() { rpc_retry 12 cast call "$1" "$2" "${@:3}" --rpc-url "$R"; }
num()  { call "$1" "$2" "${@:3}" | awk '{print $1}'; }
now()  { rpc_retry 12 cast block latest -f timestamp --rpc-url "$R"; }
tokbal() { num "$TOKEN" "balanceOf(address)(uint256)" "$1"; }
wait_until() { # wait_until <unix-ts> <label>
  local t=$1; local n; n=$(now)
  while [ "$n" -lt "$t" ]; do local d=$((t-n)); echo "  … waiting ${d}s for $2"; sleep $(( d>30 ? 30 : d+2 )); n=$(now); done
  # let one more block land so timestamp >= t is observed by the next tx
  sleep 6
}

echo "E2E on Arc  me=$ME  locker=$LOCKER  vesting=$VEST  token=$TOKEN"
echo "start: $(date -u)  chain ts: $(now)"

hr "0. Second wallet"
# Persist the throwaway key (git-ignored) so a rerun can finish wallet2's claims and reuse its gas.
KEYFILE="$(dirname "$0")/../.wallet2.key"
if [ -f "$KEYFILE" ]; then PK2=$(tr -d ' \r\n' < "$KEYFILE"); echo "  reusing wallet2 key from .wallet2.key"
else PK2=$(cast wallet new --json 2>/dev/null | grep -oE '"private_key": *"0x[0-9a-fA-F]+"' | head -1 | grep -oE '0x[0-9a-fA-F]+'); echo "$PK2" > "$KEYFILE"; echo "  new wallet2 key saved to .wallet2.key"; fi
W2=$(cast wallet address --private-key "$PK2")
echo "  wallet2 = $W2"
FUND=$(cast send "$W2" --value 200000000000000000 --private-key "$PK" --rpc-url "$R" --json 2>&1)
echo "$FUND" | grep -q '"status": *"0x1"' && ok "fund wallet2 with 0.2 USDC for gas" || bad "fund wallet2 :: $(echo "$FUND" | head -c 200)"

hr "1. Sanity"
[ "$(num $LOCKER 'lockFee()(uint256)')" = "$FEE" ] && ok "locker fee is 0.1" || bad "locker fee mismatch"
[ "$(num $VEST 'fee()(uint256)')" = "$FEE" ] && ok "vesting fee is 0.1" || bad "vesting fee mismatch"
BAL0=$(tokbal $ME); echo "  my token balance: $BAL0"

hr "2. Approvals"
send "approve locker 1000 MMCRN" "$PK" "$TOKEN" "approve(address,uint256)" "$LOCKER" $((1000))000000000000000000
send "approve vesting 1000 MMCRN" "$PK" "$TOKEN" "approve(address,uint256)" "$VEST" $((1000))000000000000000000

hr "3. Locker: negative cases"
T0=$(now); UNLOCK_A=$((T0+150))
expect_revert "lock with no fee sent" "$PK" "$LOCKER" "lock(address,uint256,uint256,address)" "$TOKEN" $((100))000000000000000000 "$UNLOCK_A" "$ME"  # VALUE unset -> 0
VALUE=$FEE expect_revert "lock with unlock in the past" "$PK" "$LOCKER" "lock(address,uint256,uint256,address)" "$TOKEN" "$ONE" $((T0-100)) "$ME"
VALUE=$FEE expect_revert "lock zero amount" "$PK" "$LOCKER" "lock(address,uint256,uint256,address)" "$TOKEN" 0 "$UNLOCK_A" "$ME"
unset VALUE

hr "4. Locker: create lock A (100 MMCRN, unlocks in ~150s)"
A=$(num $LOCKER 'nextLockId()(uint256)')
VALUE=$FEE send "lock A" "$PK" "$LOCKER" "lock(address,uint256,uint256,address)" "$TOKEN" $((100))000000000000000000 "$UNLOCK_A" "$ME"; unset VALUE
echo "  lock A id=$A"; call $LOCKER "getLock(uint256)((uint256,address,address,address,uint256,uint256,uint256))" $A | sed 's/^/  /'
[ "$(num $LOCKER 'pendingFees()(uint256)')" = "$FEE" ] && ok "pendingFees == 0.1" || bad "pendingFees wrong"

hr "5. Locker: increment, extend, split"
send "incrementLock A +50" "$PK" "$LOCKER" "incrementLock(uint256,uint256)" $A $((50))000000000000000000
AMT=$(call $LOCKER "getLock(uint256)((uint256,address,address,address,uint256,uint256,uint256))" $A | grep -oE '[0-9]{20,}' | head -1)
[ "$AMT" = "150000000000000000000" ] && ok "lock A amount is 150" || bad "lock A amount = $AMT"
UNLOCK_A2=$((UNLOCK_A+60))
send "extendLock A +60s" "$PK" "$LOCKER" "extendLock(uint256,uint256)" $A $UNLOCK_A2
expect_revert "extendLock A backwards" "$PK" "$LOCKER" "extendLock(uint256,uint256)" $A $UNLOCK_A
B=$(num $LOCKER 'nextLockId()(uint256)')
send "splitLock A -> B (40)" "$PK" "$LOCKER" "splitLock(uint256,uint256)" $A $((40))000000000000000000
expect_revert "splitLock A full balance" "$PK" "$LOCKER" "splitLock(uint256,uint256)" $A $((110))000000000000000000
echo "  lock B id=$B"
IDS=$(call $LOCKER "getLocksForUser(address)(uint256[])" $ME); echo "  my lock ids: $IDS"

hr "6. Locker: roles with wallet2"
send "setWithdrawer B -> wallet2" "$PK" "$LOCKER" "setWithdrawer(uint256,address)" $B "$W2"
expect_revert "wallet2 cannot transfer ownership of B (not owner)" "$PK2" "$LOCKER" "transferLockOwnership(uint256,address,bool)" $B "$W2" false
expect_revert "me transfer B with withdraw rights (not withdrawer)" "$PK" "$LOCKER" "transferLockOwnership(uint256,address,bool)" $B "$W2" true
send "transferLockOwnership B -> wallet2 (no rights)" "$PK" "$LOCKER" "transferLockOwnership(uint256,address,bool)" $B "$W2" false
send "wallet2 transfers B back to me WITH rights" "$PK2" "$LOCKER" "transferLockOwnership(uint256,address,bool)" $B "$ME" true
OWN=$(call $LOCKER "getLock(uint256)((uint256,address,address,address,uint256,uint256,uint256))" $B)
echo "$OWN" | grep -qi "$ME, $ME" && ok "B owner and withdrawer are me again" || bad "B roles: $OWN"
[ "$(call $LOCKER "getLocksForUser(address)(uint256[])" $W2)" = "[]" ] && ok "wallet2 index is empty" || bad "wallet2 index not cleaned"
expect_revert "withdraw A before unlock" "$PK" "$LOCKER" "withdraw(uint256,uint256)" $A "$ONE"

hr "7. Vesting: negative cases + create"
T1=$(now); VS=$T1; VC=$((T1+60)); VE=$((T1+240))
expect_revert "createVesting wrong fee" "$PK" "$VEST" "createVesting(address,(address,uint256,uint64,uint64,uint64))" "$TOKEN" "($ME,$ONE,$VS,$VC,$VE)"
VALUE=$FEE expect_revert "createVesting cliff after end" "$PK" "$VEST" "createVesting(address,(address,uint256,uint64,uint64,uint64))" "$TOKEN" "($ME,$ONE,$VS,$((VE+10)),$VE)"
unset VALUE
V1=$(num $VEST 'nextVestingId()(uint256)')
VALUE=$FEE send "createVesting V1: 120 MMCRN, cliff 60s, end 240s" "$PK" "$VEST" "createVesting(address,(address,uint256,uint64,uint64,uint64))" "$TOKEN" "($ME,$((120))000000000000000000,$VS,$VC,$VE)"; unset VALUE
echo "  V1 id=$V1"; call $VEST "getVesting(uint256)((uint256,address,address,address,uint256,uint256,uint64,uint64,uint64))" $V1 | sed 's/^/  /'
[ "$(num $VEST 'claimable(uint256)(uint256)' $V1)" = "0" ] && ok "V1 claimable is 0 before cliff" || bad "V1 claimable before cliff != 0"
expect_revert "claim V1 before cliff" "$PK" "$VEST" "claim(uint256)" $V1
V2=$(num $VEST 'nextVestingId()(uint256)')
VALUE=$((FEE*2)) send "createVestingBatch: V2 (me, no cliff, 120s) + V3 (wallet2, 30 tokens)" "$PK" "$VEST" "createVestingBatch(address,(address,uint256,uint64,uint64,uint64)[])" "$TOKEN" "[($ME,$((60))000000000000000000,$VS,$VS,$((T1+120))),($W2,$((30))000000000000000000,$VS,$VS,$((T1+120)))]"; unset VALUE
V3=$((V2+1)); echo "  V2 id=$V2, V3 id=$V3"
[ "$(num $VEST 'pendingFees()(uint256)')" = "$((FEE*3))" ] && ok "vesting pendingFees == 0.3" || bad "vesting pendingFees wrong"
[ "$(call $VEST "getVestingsForBeneficiary(address)(uint256[])" $W2)" = "[$V3]" ] && ok "wallet2 is beneficiary of V3" || bad "beneficiary index wrong"

hr "8. Wait for V1 cliff, then partial claims"
wait_until $VC "V1 cliff"
C1=$(num $VEST 'claimable(uint256)(uint256)' $V1); echo "  V1 claimable now: $C1"
big "$C1" ">" 0 && ok "V1 has claimable after cliff" || bad "V1 nothing claimable after cliff"
BEF=$(tokbal $ME)
send "claim V1 (partial)" "$PK" "$VEST" "claim(uint256)" $V1
AFT=$(tokbal $ME); big "$AFT" ">" "$BEF" && ok "my balance increased by $(sub "$AFT" "$BEF")" || bad "balance did not increase"
send "claim V2 (partial, no cliff)" "$PK" "$VEST" "claim(uint256)" $V2
expect_revert "me cannot claim V3 (wallet2's)" "$PK" "$VEST" "claim(uint256)" $V3
send "wallet2 claims V3 (partial)" "$PK2" "$VEST" "claim(uint256)" $V3
send "wallet2 setBeneficiary V3 -> me" "$PK2" "$VEST" "setBeneficiary(uint256,address)" $V3 "$ME"
expect_revert "wallet2 cannot claim V3 anymore" "$PK2" "$VEST" "claim(uint256)" $V3
send "me setBeneficiary V3 -> wallet2 (hand back)" "$PK" "$VEST" "setBeneficiary(uint256,address)" $V3 "$W2"

hr "9. Wait for locks A/B to unlock, then withdraw"
wait_until $UNLOCK_A2 "lock A unlock"
expect_revert "incrementLock A after maturity" "$PK" "$LOCKER" "incrementLock(uint256,uint256)" $A "$ONE"
expect_revert "withdraw more than lock A holds" "$PK" "$LOCKER" "withdraw(uint256,uint256)" $A $((999))000000000000000000
BEF=$(tokbal $ME)
send "withdraw A partial 10" "$PK" "$LOCKER" "withdraw(uint256,uint256)" $A $((10))000000000000000000
send "withdraw A rest 100" "$PK" "$LOCKER" "withdraw(uint256,uint256)" $A $((100))000000000000000000
send "withdraw B all 40" "$PK" "$LOCKER" "withdraw(uint256,uint256)" $B $((40))000000000000000000
AFT=$(tokbal $ME); big "$(sub "$AFT" "$BEF")" "==" 150000000000000000000 && ok "got back exactly 150 MMCRN from locks" || bad "got back $(sub "$AFT" "$BEF")"
[ "$(tokbal $LOCKER)" = "0" ] && ok "locker holds 0 tokens" || bad "locker still holds $(tokbal $LOCKER)"
expect_revert "withdraw A again (empty)" "$PK" "$LOCKER" "withdraw(uint256,uint256)" $A "$ONE"

hr "10. Wait for vesting end, final claims"
wait_until $VE "V1 end"
send "claim V1 remainder" "$PK" "$VEST" "claim(uint256)" $V1
send "claim V2 remainder" "$PK" "$VEST" "claim(uint256)" $V2
send "wallet2 claims V3 remainder" "$PK2" "$VEST" "claim(uint256)" $V3
expect_revert "claim V1 again (nothing left)" "$PK" "$VEST" "claim(uint256)" $V1
REL=$(call $VEST "getVesting(uint256)((uint256,address,address,address,uint256,uint256,uint64,uint64,uint64))" $V1 | grep -oE '[0-9]{20,}' | sed -n '1,2p' | tr '\n' ' ')
echo "  V1 total/released: $REL"
[ "$(tokbal $VEST)" = "0" ] && ok "vesting contract holds 0 tokens" || bad "vesting still holds $(tokbal $VEST)"
W2BAL=$(tokbal $W2); [ "$W2BAL" = "30000000000000000000" ] && ok "wallet2 received exactly 30 MMCRN" || bad "wallet2 has $W2BAL"

hr "11. Fees"
expect_revert "wallet2 cannot claimFees" "$PK2" "$LOCKER" "claimFees()"
NB=$(cast balance $ME --rpc-url $R)
send "claimFees locker" "$PK" "$LOCKER" "claimFees()"
send "claimFees vesting" "$PK" "$VEST" "claimFees()"
[ "$(num $LOCKER 'pendingFees()(uint256)')" = "0" ] && ok "locker pendingFees 0" || bad "locker pendingFees not 0"
[ "$(num $VEST 'pendingFees()(uint256)')" = "0" ] && ok "vesting pendingFees 0" || bad "vesting pendingFees not 0"
expect_revert "claimFees again (none)" "$PK" "$LOCKER" "claimFees()"

hr "12. Final accounting"
BAL1=$(tokbal $ME); DIFF=$(sub "$BAL0" "$BAL1")
echo "  token balance start=$BAL0 end=$BAL1 diff=$DIFF (expected 30e18 = wallet2's V3)"
big "$DIFF" "==" 30000000000000000000 && ok "net token change is exactly the 30 vested to wallet2" || bad "unexpected net change $DIFF"
echo "  native now: $(cast from-wei $(cast balance $ME --rpc-url $R)) USDC"
echo "  wallet2 native left: $(cast from-wei $(cast balance $W2 --rpc-url $R)) USDC (throwaway)"

echo; echo "════════ RESULT: $PASS passed, $FAIL failed ════════"
echo "end: $(date -u)"
[ "$FAIL" = "0" ]
