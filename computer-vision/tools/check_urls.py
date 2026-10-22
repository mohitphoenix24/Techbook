import subprocess, sys, json
from concurrent.futures import ThreadPoolExecutor
UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
def chk(u):
    try:
        r=subprocess.run(["curl","-s","-o","/dev/null","-L","-m","25","-A",UA,"-w","%{http_code} %{url_effective}",u],capture_output=True,text=True,timeout=40)
        code,eff=(r.stdout.split(" ",1)+[""])[:2]
        return u,code,eff.strip()
    except Exception as e:
        return u,"ERR",str(e)
urls=[l.strip() for l in open(sys.argv[1]) if l.strip()]
with ThreadPoolExecutor(16) as ex: res=list(ex.map(chk,urls))
out={}
for u,c,e in res:
    out[u]={"code":c,"final":e}
json.dump(out,open(sys.argv[2],"w"),indent=1)
bad=[(u,c,e) for u,c,e in res if not c.startswith("2")]
print(len(res),"checked;",len(bad),"not 2xx")
for u,c,e in bad: print(c,u,"->",e if e!=u else "")
