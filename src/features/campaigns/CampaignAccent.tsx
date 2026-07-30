import { useLocation } from 'react-router-dom';
import { useCampaign } from '@/hooks/queries';
import { useCampaignAccent } from '@/hooks/useCampaignAccent';

/**
 * 현재 주소가 캠페인 하위 경로면 그 캠페인의 강조 색을 화면에 적용한다.
 *
 * 페이지마다 훅을 부르는 대신 레이아웃에서 한 번만 처리한다.
 * 캠페인 관련 화면이 늘어나도 색 적용을 빠뜨릴 일이 없다.
 * (React Router의 useParams는 자기 경로에서 매칭된 값만 주므로 경로에서 직접 읽는다.)
 */
const CAMPAIGN_PATH = /^\/campaigns\/([0-9a-fA-F-]{36})(?:\/|$)/;

export function CampaignAccent() {
  const { pathname } = useLocation();
  const campaignId = CAMPAIGN_PATH.exec(pathname)?.[1];
  const { data: campaign } = useCampaign(campaignId);

  useCampaignAccent(campaign?.theme_color);
  return null;
}
